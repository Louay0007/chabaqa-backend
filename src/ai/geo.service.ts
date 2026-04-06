import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { CoursService } from '../cours/cours.service';
import {
  AiChapterConversation,
  AiChapterConversationDocument,
  AiChapterMessage,
} from '../schema/ai-chapter-conversation.schema';
import { GeoUserProfile, GeoUserProfileDocument } from '../schema/geo-user-profile.schema';
import { GeoQuiz, GeoQuizDocument, GeoQuizQuestion } from '../schema/geo-quiz.schema';
import { GeoGamificationService } from './geo-gamification.service';
import { GeoDifficultyLevel } from './dto/geo.dto';

const DIFFICULTY_GUIDELINES: Record<GeoDifficultyLevel, string> = {
  beginner: `BEGINNER LEVEL:
- Use simple, everyday language
- Break down complex concepts into small, clear steps
- Provide relatable analogies and real-world examples
- Avoid jargon; explain all technical terms
- Be extra encouraging and patient
- Example style: "Think of a variable like a labeled box where you store things..."`,

  intermediate: `INTERMEDIATE LEVEL:
- Use standard technical vocabulary with brief explanations
- Provide balanced explanations with moderate depth
- Include practical examples and common use cases
- Assume basic foundational knowledge
- Example style: "A variable is a named storage location in memory that holds a value..."`,

  advanced: `ADVANCED LEVEL:
- Use technical terminology freely
- Provide in-depth explanations with nuance and edge cases
- Discuss advanced patterns, best practices, and trade-offs
- Reference related advanced concepts and real implementations
- Example style: "Variables in JavaScript use lexical scoping and the temporal dead zone..."`,

  expert: `EXPERT LEVEL:
- Discuss theoretical foundations and research-level depth
- Explore cutting-edge developments and specifications
- Analyze trade-offs and design decisions critically
- Reference academic papers, RFCs, and language specifications
- Example style: "The ECMAScript specification defines variables via environment records..."`,
};

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly openai: OpenAI;
  private readonly chatModel: string;
  private readonly quizModel: string;
  private readonly visionModel: string;
  private readonly fallbackModels: string[];
  private readonly temperature: number;
  private readonly maxOutputTokens: number;
  private readonly contextCharLimit: number;
  private readonly maxQuizQuestions: number;

  constructor(
    private configService: ConfigService,
    private coursService: CoursService,
    private geoGamificationService: GeoGamificationService,
    @InjectModel(AiChapterConversation.name)
    private aiConversationModel: Model<AiChapterConversationDocument>,
    @InjectModel(GeoUserProfile.name)
    private geoProfileModel: Model<GeoUserProfileDocument>,
    @InjectModel(GeoQuiz.name)
    private geoQuizModel: Model<GeoQuizDocument>,
  ) {
    const aiProvider = (
      this.configService.get<string>('AI_PROVIDER') || 'OPENROUTER'
    ).toUpperCase();
    const useOllamaCloud = aiProvider === 'OLLAMA_CLOUD';

    const apiKey = useOllamaCloud
      ? this.configService.get<string>('OLLAMA_API_KEY')
      : this.configService.get<string>('OPENROUTER_API_KEY');

    const baseURL = useOllamaCloud
      ? this.configService.get<string>('OLLAMA_BASE_URL') || 'https://ollama.com/v1'
      : this.configService.get<string>('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1';

    const siteUrl =
      this.configService.get<string>('OPENROUTER_SITE_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'https://chabaqa.io';

    const appName = 'Geo AI Companion';
    const requestTimeoutMs = 45000;

    this.openai = new OpenAI({
      apiKey,
      baseURL,
      timeout: requestTimeoutMs,
      ...(useOllamaCloud
        ? {}
        : {
            defaultHeaders: {
              'HTTP-Referer': siteUrl,
              'X-Title': appName,
            },
          }),
    });

    const primaryModel = (
      this.configService.get<string>('GEO_CHAT_MODEL') ||
      this.configService.get<string>('AI_MODEL') ||
      (useOllamaCloud ? 'gpt-oss:20b-cloud' : 'google/gemini-2.5-flash-lite')
    ).trim();

    const fallbackRaw = (
      this.configService.get<string>('AI_FALLBACK_MODELS') ||
      (useOllamaCloud
        ? 'minimax-m2.1:cloud,glm-4.7:cloud'
        : 'google/gemini-2.0-flash-001,google/gemini-2.0-flash-lite-001,mistralai/mistral-small-3.1-24b-instruct:free')
    ).split(',').map((m) => m.trim()).filter(Boolean);

    this.fallbackModels = [...new Set([primaryModel, ...fallbackRaw])];

    this.chatModel = primaryModel;
    this.quizModel = (
      this.configService.get<string>('GEO_QUIZ_MODEL') || primaryModel
    ).trim();
    this.visionModel = (
      this.configService.get<string>('GEO_VISION_MODEL') ||
      'google/gemini-2.0-flash-001'
    ).trim();

    this.temperature = 0.4;
    this.maxOutputTokens = 1200;
    this.contextCharLimit = 16000;
    this.maxQuizQuestions = Math.min(
      parseInt(this.configService.get<string>('GEO_MAX_QUIZ_QUESTIONS') || '10', 10),
      10,
    );

    this.logger.log(`Geo AI initialized. Chat: ${this.chatModel}, Quiz: ${this.quizModel}, Vision: ${this.visionModel}`);

    if (!apiKey) {
      this.logger.error('AI API key is missing. Geo requests will fail.');
    }
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  private toUserObjectId(userId: any): Types.ObjectId {
    if (userId instanceof Types.ObjectId) return userId;
    const normalized = String(userId || '').trim();
    if (!normalized) throw new UnauthorizedException('User context is missing');
    if (!Types.ObjectId.isValid(normalized)) throw new UnauthorizedException('Invalid user context');
    return new Types.ObjectId(normalized);
  }

  private normalizeRequiredString(value: any, field: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private truncateContext(context: string): string {
    if (context.length <= this.contextCharLimit) return context;
    return `${context.slice(0, this.contextCharLimit)}\n\n[Context truncated.]`;
  }

  private extractCompletionText(completion: any): string {
    const raw = completion?.choices?.[0]?.message?.content;
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) {
      return raw.map((item: any) => (typeof item?.text === 'string' ? item.text : '')).join('\n').trim();
    }
    return '';
  }

  private extractErrorMessage(error: any): string {
    return error?.error?.message || error?.message || error?.cause?.message || 'Unknown AI error';
  }

  private buildGeoSystemPrompt(
    courseName: string,
    chapterName: string,
    sectionName: string,
    difficultyLevel: GeoDifficultyLevel,
    context: string,
  ): string {
    return `You are Geo, an intelligent and adaptive learning companion for the course "${courseName}".

PERSONALITY:
- Friendly, encouraging, and patient
- Adapt your language and depth to the student's level
- Use analogies and real-world examples generously
- Celebrate learning milestones and curiosity
- Guide students to discover answers, don't just give them directly

CURRENT CONTEXT:
- Course: ${courseName}
- Section: ${sectionName}
- Chapter: ${chapterName}
- Student Level: ${difficultyLevel.toUpperCase()}

${DIFFICULTY_GUIDELINES[difficultyLevel]}

CHAPTER CONTENT (use this as your primary source):
${context}

RESPONSE STRUCTURE:
1. Direct, clear answer to the question
2. Explanation adapted to the student's level
3. Practical example or analogy (when helpful)
4. Related concepts or next steps (briefly)
5. Short encouraging closing line

IMPORTANT RULES:
- Stay within the provided chapter context as much as possible
- If a question is outside the chapter, say so clearly but still try to help
- Encourage follow-up questions
- Be concise but complete (aim for 150-400 words)
- Use markdown formatting for lists and code blocks when helpful`;
  }

  private async callWithFallback(
    messages: any[],
    model: string,
    options?: { temperature?: number; maxTokens?: number; responseFormat?: any },
  ): Promise<string> {
    const modelsToTry = model === this.chatModel
      ? this.fallbackModels
      : [model, ...this.fallbackModels.filter((m) => m !== model)];

    const errors: Array<{ model: string; message: string }> = [];

    for (const m of modelsToTry) {
      try {
        const params: any = {
          model: m,
          temperature: options?.temperature ?? this.temperature,
          max_tokens: options?.maxTokens ?? this.maxOutputTokens,
          messages,
        };

        if (options?.responseFormat) {
          params.response_format = options.responseFormat;
        }

        const completion = await this.openai.chat.completions.create(params);
        const text = this.extractCompletionText(completion);
        if (!text) throw new Error('Empty response from model');
        return text;
      } catch (error: any) {
        const message = this.extractErrorMessage(error);
        errors.push({ model: m, message });
        this.logger.warn(`Geo model failed model=${m}: ${message}`);
      }
    }

    const allRateLimited = errors.every(
      (e) => e.message.toLowerCase().includes('rate limit') || e.message.toLowerCase().includes('429'),
    );

    if (allRateLimited) {
      throw new ServiceUnavailableException('AI is temporarily rate-limited. Please retry in a few seconds.');
    }

    throw new InternalServerErrorException('Failed to generate response from AI');
  }

  private async getCourseAndChapter(courseId: string, chapterId: string) {
    const course = await this.coursService.obtenirCours(courseId);
    if (!course) throw new NotFoundException('Course not found');

    let targetChapter: any = null;
    let targetSection: any = null;

    if (course.sections) {
      for (const section of course.sections) {
        if (section.chapitres) {
          const chapter = section.chapitres.find((c: any) => String(c.id) === chapterId);
          if (chapter) {
            targetChapter = chapter;
            targetSection = section;
            break;
          }
        }
      }
    }

    if (!targetChapter) throw new NotFoundException('Chapter not found');
    if (!targetSection) throw new NotFoundException('Section not found');

    return { course, targetChapter, targetSection };
  }

  // ─── PUBLIC METHODS ──────────────────────────────────────────────────────────

  async askGeoQuestion(
    courseId: string,
    chapterId: string,
    question: string,
    userId: any,
    options?: {
      difficultyLevel?: GeoDifficultyLevel;
      imageBase64?: string;
    },
  ) {
    const normalizedCourseId = this.normalizeRequiredString(courseId, 'courseId');
    const normalizedChapterId = this.normalizeRequiredString(chapterId, 'chapterId');
    const normalizedQuestion = this.normalizeRequiredString(question, 'question');
    const userObjectId = this.toUserObjectId(userId);
    const difficultyLevel: GeoDifficultyLevel = options?.difficultyLevel || 'intermediate';

    const { course, targetChapter, targetSection } = await this.getCourseAndChapter(
      normalizedCourseId,
      normalizedChapterId,
    );

    const sectionTitle = String(targetSection.titre ?? targetSection.title ?? '');
    const chapterTitle = String(targetChapter.titre ?? targetChapter.title ?? '');
    const chapterDescription = String(targetChapter.description ?? targetChapter.content ?? '');
    const chapterNotes = String(targetChapter.notes ?? '');

    const context = this.truncateContext(`
Content/Description:
${chapterDescription || 'No text content provided.'}

Notes:
${chapterNotes || 'No notes provided.'}
    `);

    const systemPrompt = this.buildGeoSystemPrompt(
      course.titre,
      chapterTitle,
      sectionTitle,
      difficultyLevel,
      context,
    );

    // Load recent conversation history
    const conversation = await this.aiConversationModel
      .findOne({ userId: userObjectId, courseId: normalizedCourseId, chapterId: normalizedChapterId })
      .select({ messages: 1 })
      .lean();

    const recentMessages = ((conversation as any)?.messages || [])
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .filter((m: any) => m.content?.trim())
      .slice(-12)
      .map((m: any) => ({ role: m.role, content: m.content.trim() }));

    // Build messages array
    const messages: any[] = [{ role: 'system', content: systemPrompt }, ...recentMessages];

    if (options?.imageBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: normalizedQuestion },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${options.imageBase64}` },
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: normalizedQuestion });
    }

    const modelToUse = options?.imageBase64 ? this.visionModel : this.chatModel;
    const answer = await this.callWithFallback(messages, modelToUse);

    // Save to conversation history
    try {
      const turnMessages = [
        { role: 'user', content: normalizedQuestion, createdAt: new Date() },
        { role: 'assistant', content: answer, createdAt: new Date(), model: modelToUse },
      ];
      await this.aiConversationModel.updateOne(
        { userId: userObjectId, courseId: normalizedCourseId, chapterId: normalizedChapterId },
        {
          $setOnInsert: { userId: userObjectId, courseId: normalizedCourseId, chapterId: normalizedChapterId },
          $push: { messages: { $each: turnMessages, $slice: -80 } },
        },
        { upsert: true },
      );
    } catch (e: any) {
      this.logger.error(`Failed to save Geo conversation: ${e?.message}`);
    }

    // Gamification: award points + update streak
    let gamificationResult: any = {};
    try {
      const [streakResult, questionResult] = await Promise.all([
        this.geoGamificationService.updateStreak(userObjectId),
        this.geoGamificationService.incrementQuestionsAsked(userObjectId),
      ]);

      if (options?.imageBase64) {
        await this.geoGamificationService.incrementImagesShared(userObjectId);
      }

      gamificationResult = {
        pointsEarned: 5,
        newAchievements: [...streakResult.newAchievements, ...questionResult.newAchievements],
        currentStreak: streakResult.currentStreak,
      };
    } catch (e: any) {
      this.logger.warn(`Geo gamification error: ${e?.message}`);
    }

    return {
      answer,
      chapterId: normalizedChapterId,
      difficultyLevel,
      ...gamificationResult,
    };
  }

  async generateQuiz(
    courseId: string,
    chapterId: string,
    userId: any,
    options: {
      difficultyLevel: GeoDifficultyLevel;
      questionCount?: number;
      questionTypes?: string[];
    },
  ) {
    const normalizedCourseId = this.normalizeRequiredString(courseId, 'courseId');
    const normalizedChapterId = this.normalizeRequiredString(chapterId, 'chapterId');
    const userObjectId = this.toUserObjectId(userId);
    const difficultyLevel = options.difficultyLevel || 'intermediate';
    const questionCount = Math.min(options.questionCount || 5, this.maxQuizQuestions);
    const questionTypes = options.questionTypes?.length ? options.questionTypes : ['multiple-choice', 'true-false'];

    const { course, targetChapter } = await this.getCourseAndChapter(normalizedCourseId, normalizedChapterId);
    const chapterTitle = String(targetChapter.titre ?? targetChapter.title ?? '');
    const chapterContent = this.truncateContext(
      String(targetChapter.description ?? targetChapter.content ?? '') +
      '\n' +
      String(targetChapter.notes ?? ''),
    );

    const prompt = `Generate exactly ${questionCount} quiz questions about the chapter "${chapterTitle}" from the course "${course.titre}".

DIFFICULTY LEVEL: ${difficultyLevel.toUpperCase()}
${DIFFICULTY_GUIDELINES[difficultyLevel]}

QUESTION TYPES REQUIRED: ${questionTypes.join(', ')}

CHAPTER CONTENT:
${chapterContent}

Return a valid JSON object with this exact structure:
{
  "questions": [
    {
      "id": "q1",
      "question": "Question text here?",
      "type": "multiple-choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

For true-false questions, options should be ["True", "False"].
For fill-blank questions, omit options array and provide the correct word/phrase as correctAnswer.
Make all questions directly based on the chapter content provided.`;

    const responseText = await this.callWithFallback(
      [
        { role: 'system', content: 'You are Geo, an expert educational assessment creator. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      this.quizModel,
      { temperature: 0.5, maxTokens: 2500, responseFormat: { type: 'json_object' } },
    );

    let parsedQuestions: GeoQuizQuestion[];
    try {
      const parsed = JSON.parse(responseText);
      parsedQuestions = (Array.isArray(parsed) ? parsed : parsed.questions || []).slice(0, questionCount);
      parsedQuestions = parsedQuestions.map((q: any, idx: number) => ({
        ...q,
        id: q.id || `q${idx + 1}`,
      }));
    } catch (e) {
      this.logger.error(`Failed to parse quiz JSON: ${responseText.slice(0, 200)}`);
      throw new InternalServerErrorException('Failed to generate quiz questions');
    }

    if (!parsedQuestions.length) {
      throw new InternalServerErrorException('No quiz questions generated');
    }

    // Save quiz to DB
    const quiz = await this.geoQuizModel.create({
      userId: userObjectId,
      courseId: normalizedCourseId,
      chapterId: normalizedChapterId,
      difficultyLevel,
      questions: parsedQuestions,
    });

    // Return questions WITHOUT correct answers
    return {
      quizId: String(quiz._id),
      difficultyLevel,
      questions: parsedQuestions.map((q) => ({
        id: q.id,
        question: q.question,
        type: q.type,
        options: q.options,
      })),
    };
  }

  async submitQuizAnswers(
    quizId: string,
    userId: any,
    answers: { questionId: string; answer: string }[],
  ) {
    const userObjectId = this.toUserObjectId(userId);

    if (!Types.ObjectId.isValid(quizId)) {
      throw new BadRequestException('Invalid quiz ID');
    }

    const quiz = await this.geoQuizModel.findOne({
      _id: new Types.ObjectId(quizId),
      userId: userObjectId,
    });

    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.completedAt) throw new BadRequestException('Quiz already submitted');

    const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));

    let correct = 0;
    const gradedQuestions = quiz.questions.map((q) => {
      const userAnswer = answerMap.get(q.id) || '';
      const isCorrect = userAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
      if (isCorrect) correct++;
      return {
        id: q.id,
        question: q.question,
        type: q.type,
        options: q.options,
        userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const total = quiz.questions.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Points: 10 per correct answer + difficulty bonus + perfect bonus
    const difficultyMultiplier: Record<GeoDifficultyLevel, number> = {
      beginner: 1, intermediate: 1.5, advanced: 2, expert: 3,
    };
    const basePoints = correct * 10 * (difficultyMultiplier[quiz.difficultyLevel] || 1);
    const perfectBonus = percentage === 100 ? 50 : 0;
    const pointsEarned = Math.floor(basePoints + perfectBonus);

    // Use updateOne with $set to avoid Mongoose subdocument re-validation issues
    await this.geoQuizModel.updateOne(
      { _id: quiz._id },
      {
        $set: {
          questions: gradedQuestions,
          score: correct,
          totalQuestions: total,
          percentage,
          pointsEarned,
          completedAt: new Date(),
        },
      },
    );

    // Gamification
    let newAchievements: string[] = [];
    try {
      const result = await this.geoGamificationService.incrementQuizzesCompleted(userObjectId, pointsEarned);
      newAchievements = result.newAchievements;
    } catch (e: any) {
      this.logger.warn(`Quiz gamification error: ${e?.message}`);
    }

    return {
      score: correct,
      totalQuestions: total,
      percentage,
      pointsEarned,
      difficultyLevel: quiz.difficultyLevel,
      results: gradedQuestions,
      newAchievements,
    };
  }

  async getExplanation(
    courseId: string,
    chapterId: string,
    topic: string,
    userId: any,
    difficultyLevel: GeoDifficultyLevel,
  ) {
    const normalizedCourseId = this.normalizeRequiredString(courseId, 'courseId');
    const normalizedChapterId = this.normalizeRequiredString(chapterId, 'chapterId');
    const normalizedTopic = this.normalizeRequiredString(topic, 'topic');

    const { course, targetChapter, targetSection } = await this.getCourseAndChapter(
      normalizedCourseId,
      normalizedChapterId,
    );

    const chapterTitle = String(targetChapter.titre ?? targetChapter.title ?? '');
    const sectionTitle = String(targetSection.titre ?? targetSection.title ?? '');
    const chapterContent = this.truncateContext(
      String(targetChapter.description ?? targetChapter.content ?? '') +
      '\n' +
      String(targetChapter.notes ?? ''),
    );

    const prompt = `I need a detailed explanation of "${normalizedTopic}" from the chapter "${chapterTitle}" in course "${course.titre}".

${DIFFICULTY_GUIDELINES[difficultyLevel]}

Chapter Content:
${chapterContent}

Provide the explanation in this JSON format:
{
  "explanation": "Main explanation here",
  "examples": ["Example 1", "Example 2"],
  "relatedConcepts": ["Concept 1", "Concept 2"],
  "prerequisites": ["Prerequisite 1"]
}`;

    const responseText = await this.callWithFallback(
      [
        {
          role: 'system',
          content: `You are Geo, explaining concepts at ${difficultyLevel} level. Return valid JSON only.`,
        },
        { role: 'user', content: prompt },
      ],
      this.chatModel,
      { temperature: 0.4, maxTokens: 1500, responseFormat: { type: 'json_object' } },
    );

    try {
      return JSON.parse(responseText);
    } catch {
      return { explanation: responseText, examples: [], relatedConcepts: [], prerequisites: [] };
    }
  }

  async getGeoProfile(userId: any) {
    const userObjectId = this.toUserObjectId(userId);
    return this.geoGamificationService.getProfile(userObjectId);
  }

  async updateDifficultyPreference(userId: any, difficultyLevel: GeoDifficultyLevel) {
    const userObjectId = this.toUserObjectId(userId);
    return this.geoGamificationService.updateDifficultyPreference(userObjectId, difficultyLevel);
  }

  async getGeoHistory(courseId: string, chapterId: string, userId: any) {
    const normalizedCourseId = this.normalizeRequiredString(courseId, 'courseId');
    const normalizedChapterId = this.normalizeRequiredString(chapterId, 'chapterId');
    const userObjectId = this.toUserObjectId(userId);

    const conversation = await this.aiConversationModel
      .findOne({ userId: userObjectId, courseId: normalizedCourseId, chapterId: normalizedChapterId })
      .select({ messages: 1 })
      .lean();

    const messages = ((conversation as any)?.messages || [])
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'geo' : 'user',
        content: m.content.trim(),
        createdAt: m.createdAt || null,
      }));

    return { courseId: normalizedCourseId, chapterId: normalizedChapterId, messages };
  }

  getAllAchievements() {
    return this.geoGamificationService.getAllAchievements();
  }
}
