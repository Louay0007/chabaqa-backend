import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoursService } from '../cours/cours.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import {
  AiChapterConversation,
  AiChapterConversationDocument,
  AiChapterMessage,
} from '../schema/ai-chapter-conversation.schema';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;
  private readonly modelCandidates: string[];
  private readonly temperature: number;
  private readonly maxOutputTokens: number;
  private readonly contextCharLimit: number;
  private readonly historyMessageLimit: number;
  private readonly contextHistoryMessageLimit: number;

  constructor(
    private configService: ConfigService,
    private coursService: CoursService,
    @InjectModel(AiChapterConversation.name)
    private aiConversationModel: Model<AiChapterConversationDocument>,
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
      : this.configService.get<string>('OPENROUTER_BASE_URL') ||
        'https://openrouter.ai/api/v1';
    const siteUrl =
      this.configService.get<string>('OPENROUTER_SITE_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'https://chabaqa.io';
    const appName = useOllamaCloud
      ? this.configService.get<string>('OLLAMA_APP_NAME') || 'Chabaqa AI Tutor'
      : this.configService.get<string>('OPENROUTER_APP_NAME') ||
        'Chabaqa AI Tutor';
    const requestTimeoutMs = this.parseNumberConfig(
      'AI_REQUEST_TIMEOUT_MS',
      30000,
      5000,
      120000,
    );
    const primaryModel = (
      this.configService.get<string>('AI_MODEL') ||
      (useOllamaCloud ? 'gpt-oss:20b-cloud' : 'google/gemini-2.5-flash-lite')
    ).trim();
    const fallbackModels = (
      this.configService.get<string>('AI_FALLBACK_MODELS') ||
      (useOllamaCloud
        ? 'minimax-m2.1:cloud,glm-4.7:cloud'
        : 'google/gemini-2.0-flash-001,google/gemini-2.0-flash-lite-001,mistralai/mistral-small-3.1-24b-instruct:free')
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    this.modelCandidates = [...new Set([primaryModel, ...fallbackModels])];
    this.temperature = this.parseNumberConfig('AI_TEMPERATURE', 0.3, 0, 1);
    this.maxOutputTokens = this.parseNumberConfig(
      'AI_MAX_OUTPUT_TOKENS',
      700,
      128,
      4000,
    );
    this.contextCharLimit = this.parseNumberConfig(
      'AI_CONTEXT_CHAR_LIMIT',
      16000,
      2000,
      80000,
    );
    this.historyMessageLimit = this.parseNumberConfig(
      'AI_HISTORY_MAX_MESSAGES',
      80,
      10,
      500,
    );
    this.contextHistoryMessageLimit = this.parseNumberConfig(
      'AI_CONTEXT_HISTORY_MESSAGES',
      14,
      0,
      60,
    );

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

    if (!apiKey) {
      this.logger.error(
        `${useOllamaCloud ? 'OLLAMA_API_KEY' : 'OPENROUTER_API_KEY'} is missing. AI Tutor requests will fail until it is configured.`,
      );
    }

    this.logger.log(
      `AI tutor initialized with models: ${this.modelCandidates.join(' -> ')}`,
    );
  }

  private parseNumberConfig(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = this.configService.get<string>(key);
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(Math.max(value, min), max);
  }

  private truncateContext(context: string): string {
    if (context.length <= this.contextCharLimit) return context;
    return `${context.slice(0, this.contextCharLimit)}\n\n[Context truncated to fit model limits.]`;
  }

  private extractCompletionText(completion: any): string {
    const raw = completion?.choices?.[0]?.message?.content;
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) {
      return raw
        .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
        .join('\n')
        .trim();
    }
    return '';
  }

  private extractErrorMessage(error: any): string {
    return (
      error?.error?.message ||
      error?.message ||
      error?.cause?.message ||
      'Unknown AI provider error'
    );
  }

  private normalizeRequiredString(value: any, field: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }
    return normalized;
  }

  private toUserObjectId(userId: any): Types.ObjectId {
    if (userId instanceof Types.ObjectId) return userId;
    const normalized = String(userId || '').trim();
    if (!normalized) {
      throw new UnauthorizedException('User context is missing');
    }
    if (!Types.ObjectId.isValid(normalized)) {
      throw new UnauthorizedException('Invalid user context');
    }
    return new Types.ObjectId(normalized);
  }

  private toAssistantChatHistory(messages: AiChapterMessage[]): any[] {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    if (this.contextHistoryMessageLimit <= 0) return [];

    const valid = messages
      .filter(
        (message) =>
          message &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string' &&
          message.content.trim().length > 0,
      )
      .slice(-this.contextHistoryMessageLimit)
      .map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }));

    return valid;
  }

  private toApiHistory(messages: AiChapterMessage[]) {
    if (!Array.isArray(messages)) return [];
    return messages
      .filter(
        (message) =>
          message &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string' &&
          message.content.trim().length > 0,
      )
      .map((message) => ({
        role: message.role === 'assistant' ? 'ai' : 'user',
        content: message.content.trim(),
        createdAt: message.createdAt || null,
      }));
  }

  private async saveConversationTurn(
    userId: Types.ObjectId,
    courseId: string,
    chapterId: string,
    question: string,
    answer: string,
    model: string,
  ): Promise<void> {
    const turnMessages = [
      {
        role: 'user',
        content: question,
        createdAt: new Date(),
      },
      {
        role: 'assistant',
        content: answer,
        createdAt: new Date(),
        model,
      },
    ];

    await this.aiConversationModel.updateOne(
      { userId, courseId, chapterId },
      {
        $setOnInsert: { userId, courseId, chapterId },
        $push: {
          messages: {
            $each: turnMessages,
            $slice: -this.historyMessageLimit,
          },
        },
      },
      { upsert: true },
    );
  }

  async getChapterHistory(courseId: string, chapterId: string, userId: any) {
    const normalizedCourseId = this.normalizeRequiredString(courseId, 'courseId');
    const normalizedChapterId = this.normalizeRequiredString(chapterId, 'chapterId');
    const userObjectId = this.toUserObjectId(userId);

    const conversation = await this.aiConversationModel
      .findOne({
        userId: userObjectId,
        courseId: normalizedCourseId,
        chapterId: normalizedChapterId,
      })
      .select({ messages: 1 })
      .lean();

    return {
      courseId: normalizedCourseId,
      chapterId: normalizedChapterId,
      messages: this.toApiHistory((conversation as any)?.messages || []),
    };
  }

  async askChapterQuestion(
    courseId: string,
    chapterId: string,
    question: string,
    userId: any,
  ) {
    const normalizedCourseId = this.normalizeRequiredString(courseId, 'courseId');
    const normalizedChapterId = this.normalizeRequiredString(chapterId, 'chapterId');
    const userObjectId = this.toUserObjectId(userId);
    const normalizedQuestion = String(question || '').trim();
    if (!normalizedQuestion) {
      throw new BadRequestException('Question is required');
    }

    // 1. Get Course and Chapter Data using CoursService
    // obtenirCours handles both ObjectId and string ID logic
    const course = await this.coursService.obtenirCours(normalizedCourseId);
    if (!course) throw new NotFoundException('Course not found');

    type ChapterContext = {
      id?: string;
      titre?: string;
      title?: string;
      description?: string;
      content?: string;
      notes?: string;
    };

    type SectionContext = {
      id?: string;
      titre?: string;
      title?: string;
    };

    let targetChapter: ChapterContext | null = null;
    let targetSection: SectionContext | null = null;

    // Find the chapter in the DTO structure
    // CoursResponseDto structure: sections -> chapitres
    if (course.sections) {
      for (const section of course.sections) {
        if (section.chapitres) {
          const chapter = section.chapitres.find(
            (c: any) => String(c.id) === normalizedChapterId,
          );
          if (chapter) {
            targetChapter = chapter as any;
            targetSection = section as any;
            break;
          }
        }
      }
    }

    if (!targetChapter) throw new NotFoundException('Chapter not found');
    if (!targetSection) throw new NotFoundException('Section not found');

    const sectionTitle = String(targetSection.titre ?? targetSection.title ?? '');
    const chapterTitle = String(targetChapter.titre ?? targetChapter.title ?? '');
    const chapterDescription = String(targetChapter.description ?? targetChapter.content ?? '');
    const chapterNotes = String(targetChapter.notes ?? '');

    // 2. Build Context
    // Note: In the DTO, 'description' is often mapped from 'contenu'
    const context = this.truncateContext(`
      Course Title: ${course.titre}
      Section: ${sectionTitle}
      Chapter: ${chapterTitle}
      
      Content/Description:
      ${chapterDescription || 'No text content provided.'}
      
      Notes:
      ${chapterNotes || 'No notes provided.'}
    `);

    const conversation = await this.aiConversationModel
      .findOne({
        userId: userObjectId,
        courseId: normalizedCourseId,
        chapterId: normalizedChapterId,
      })
      .select({ messages: 1 })
      .lean();
    const historyMessages = this.toAssistantChatHistory(
      (conversation as any)?.messages || [],
    );

    // 3. Call OpenRouter with model fallback chain
    let lastError: any = null;
    const errors: Array<{ model: string; status: string; message: string }> = [];

    for (const model of this.modelCandidates) {
      try {
        const completionMessages: any[] = [
          {
            role: 'system',
            content: `You are a helpful teaching assistant for the course "${course.titre}".
Use only the provided chapter context as your primary source.
If information is missing from the chapter context, say clearly that the answer is outside the provided material.
Keep answers concise, practical, and student-friendly.

Context:
${context}`,
          },
          ...historyMessages,
          { role: 'user', content: normalizedQuestion },
        ];

        const completion = await this.openai.chat.completions.create({
          model,
          temperature: this.temperature,
          max_tokens: this.maxOutputTokens,
          messages: completionMessages,
        });

        const answer = this.extractCompletionText(completion);
        if (!answer) {
          throw new Error('Model returned an empty response');
        }

        try {
          await this.saveConversationTurn(
            userObjectId,
            normalizedCourseId,
            normalizedChapterId,
            normalizedQuestion,
            answer,
            model,
          );
        } catch (persistError: any) {
          this.logger.error(
            `Failed to save AI conversation user=${userObjectId.toString()} course=${normalizedCourseId} chapter=${normalizedChapterId}: ${persistError?.message || persistError}`,
          );
        }

        return {
          answer,
          chapterId: normalizedChapterId,
          model,
        };
      } catch (error: any) {
        lastError = error;
        const message = this.extractErrorMessage(error);
        const status =
          error?.status ||
          error?.code ||
          error?.error?.code ||
          'unknown';
        errors.push({ model, status: String(status), message });
        this.logger.warn(
          `AI model failed model=${model} status=${status} message=${message}`,
        );
      }
    }

    const allRateLimited =
      errors.length > 0 &&
      errors.every(
        (error) =>
          error.status === '429' ||
          error.message.toLowerCase().includes('rate limit') ||
          error.message.toLowerCase().includes('provider returned error'),
      );
    if (allRateLimited) {
      throw new ServiceUnavailableException(
        'AI provider is temporarily rate-limited. Please retry in a few seconds.',
      );
    }

    this.logger.error(
      `AI tutor failed across all models (${this.modelCandidates.join(', ')}): ${this.extractErrorMessage(lastError)}`,
    );
    throw new InternalServerErrorException('Failed to generate response from AI');
  }
}
