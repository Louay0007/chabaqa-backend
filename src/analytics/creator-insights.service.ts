import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CacheService } from '../common/services/cache.service';
import { AnalyticsService } from './analytics.service';
import { validateCreatorInsightsResponse, type CreatorInsightsResponse } from './creator-insights.validator';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

type ContentType =
  | 'course'
  | 'challenge'
  | 'session'
  | 'event'
  | 'product'
  | 'post'
  | 'community';

const normalizeContentType = (value: string): ContentType => {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'course' ||
    normalized === 'challenge' ||
    normalized === 'session' ||
    normalized === 'event' ||
    normalized === 'product' ||
    normalized === 'post' ||
    normalized === 'community'
  ) {
    return normalized;
  }
  throw new ServiceUnavailableException('Unsupported contentType for insights');
};

const safeJsonExtract = (text: string): any | null => {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // If it already looks like JSON, try it directly.
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      return JSON.parse(raw);
    } catch {
      // continue
    }
  }

  // Otherwise, best-effort extract first JSON object.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
};

const truncate = (value: string, maxChars: number): string => {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated]`;
};

@Injectable()
export class CreatorInsightsService {
  private readonly logger = new Logger(CreatorInsightsService.name);
  private readonly client: OpenAI;
  private readonly models: string[];
  private readonly maxTokens: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly analyticsService: AnalyticsService,
    @InjectConnection() private readonly dbConnection: Connection,
  ) {
    const aiProvider = (
      this.configService.get<string>('AI_PROVIDER') || 'OPENROUTER'
    ).toUpperCase();
    const useOllamaCloud = aiProvider === 'OLLAMA_CLOUD';
    const apiKey = useOllamaCloud
      ? this.configService.get<string>('OLLAMA_API_KEY') || ''
      : this.configService.get<string>('OPENROUTER_API_KEY') || '';
    const baseURL = useOllamaCloud
      ? this.configService.get<string>('OLLAMA_BASE_URL') || 'https://ollama.com/v1'
      : this.configService.get<string>('OPENROUTER_BASE_URL') ||
        'https://openrouter.ai/api/v1';

    this.client = new OpenAI({
      apiKey,
      baseURL,
      ...(useOllamaCloud
        ? {}
        : {
            defaultHeaders: {
              'HTTP-Referer':
                this.configService.get<string>('OPENROUTER_SITE_URL') ||
                this.configService.get<string>('FRONTEND_URL') ||
                'https://chabaqa.io',
              'X-Title':
                this.configService.get<string>('OPENROUTER_APP_NAME') ||
                'Chabaqa Creator Insights',
            },
          }),
    });

    const primary =
      this.configService.get<string>('CREATOR_INSIGHTS_AI_MODEL') ||
      this.configService.get<string>('AI_MODEL') ||
      (useOllamaCloud ? 'gpt-oss:20b-cloud' : 'google/gemini-2.5-flash-lite');
    const fallback =
      this.configService.get<string>('CREATOR_INSIGHTS_AI_FALLBACK_MODELS') ||
      this.configService.get<string>('AI_FALLBACK_MODELS') ||
      (useOllamaCloud
        ? 'minimax-m2.1:cloud,glm-4.7:cloud'
        : 'google/gemini-2.0-flash-001,google/gemini-2.0-flash-lite-001,mistralai/mistral-small-3.1-24b-instruct:free');

    this.models = [
      ...new Set(
        [primary.trim(), ...fallback.split(',').map((v) => v.trim()).filter(Boolean)],
      ),
    ];
    this.maxTokens = Math.max(
      256,
      Math.min(2000, Number(this.configService.get<string>('CREATOR_INSIGHTS_AI_MAX_OUTPUT_TOKENS') || 900)),
    );
  }

  private cacheKey(params: {
    creatorId: string;
    contentType: string;
    contentId: string;
    from: string;
    to: string;
    communityId?: string;
    communitySlug?: string;
    focusStepId?: string;
    promptVersion: string;
  }): string {
    const communityScope = params.communityId || params.communitySlug || 'all';
    return [
      'creator-insights',
      params.creatorId,
      params.contentType,
      params.contentId,
      params.from,
      params.to,
      communityScope,
      params.focusStepId || 'auto',
      params.promptVersion,
    ].join(':');
  }

  private async enforceRateLimits(params: {
    creatorId: string;
    contentType: string;
    contentId: string;
  }): Promise<void> {
    const creatorLimit = Math.max(1, Math.min(500, Number(this.configService.get<string>('CREATOR_INSIGHTS_DAILY_LIMIT') || 30)));
    const contentLimit = Math.max(1, Math.min(200, Number(this.configService.get<string>('CREATOR_INSIGHTS_DAILY_CONTENT_LIMIT') || 5)));
    const ttlSeconds = 24 * 3600;
    const dateKey = new Date().toISOString().slice(0, 10);

    const creatorKey = `creator-insights:rate:creator:${params.creatorId}:${dateKey}`;
    const contentKey = `creator-insights:rate:content:${params.creatorId}:${params.contentType}:${params.contentId}:${dateKey}`;

    const creatorCount = await this.cacheService.incrementWithTtl(creatorKey, 1, ttlSeconds);
    if (typeof creatorCount === 'number' && creatorCount > creatorLimit) {
      throw new HttpException('Daily AI insights limit reached', HttpStatus.TOO_MANY_REQUESTS);
    }

    const contentCount = await this.cacheService.incrementWithTtl(contentKey, 1, ttlSeconds);
    if (typeof contentCount === 'number' && contentCount > contentLimit) {
      throw new HttpException(
        'Daily AI insights limit reached for this content item',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async loadFocusSnippet(params: {
    contentType: ContentType;
    contentId: string;
    focusStepId?: string;
  }): Promise<{ title: string; snippet: string } | null> {
    const contentId = params.contentId;
    const focusStepId = params.focusStepId ? String(params.focusStepId).trim() : '';

    if (params.contentType === 'course') {
      const courses = this.dbConnection.db?.collection('cours');
      if (!courses) return null;
      const match: any[] = [{ id: contentId }];
      if (Types.ObjectId.isValid(contentId)) match.push({ _id: new Types.ObjectId(contentId) });
      const course = await courses.findOne({ $or: match });
      if (!course) return null;

      const sections = Array.isArray(course.sections) ? course.sections : [];
      const chapters: any[] = sections.flatMap((s: any) => (Array.isArray(s.chapitres) ? s.chapitres : []));
      const chapter = focusStepId
        ? chapters.find((c: any) => String(c?.id) === focusStepId)
        : chapters[0];
      if (!chapter) return null;
      const title = String(chapter?.titre || chapter?.title || 'Chapter');
      const snippet = truncate(String(chapter?.contenu || chapter?.content || ''), 4000);
      return { title, snippet };
    }

    if (params.contentType === 'challenge') {
      const challenges = this.dbConnection.db?.collection('challenges');
      if (!challenges) return null;
      const match: any[] = [{ id: contentId }];
      if (Types.ObjectId.isValid(contentId)) match.push({ _id: new Types.ObjectId(contentId) });
      const challenge = await challenges.findOne({ $or: match });
      if (!challenge) return null;
      const tasks = Array.isArray(challenge.tasks) ? challenge.tasks : [];
      const task = focusStepId
        ? tasks.find((t: any) => String(t?.id) === focusStepId || String(t?.day) === focusStepId)
        : tasks[0];
      if (!task) return null;
      const title = String(task?.title || `Task ${task?.day || ''}` || 'Task');
      const textCandidate = task?.description || task?.instructions || task?.content || '';
      const snippet = truncate(String(textCandidate), 4000);
      return { title, snippet };
    }

    const collectionName =
      params.contentType === 'session'
        ? 'sessions'
        : params.contentType === 'event'
          ? 'events'
          : params.contentType === 'product'
            ? 'products'
            : params.contentType === 'post'
              ? 'posts'
              : 'communities';
    const collection = this.dbConnection.db?.collection(collectionName);
    if (!collection) return null;
    const match: any[] = [{ id: contentId }];
    if (Types.ObjectId.isValid(contentId)) match.push({ _id: new Types.ObjectId(contentId) });
    if (params.contentType === 'community') {
      match.push({ slug: contentId });
    }
    const doc = await collection.findOne({ $or: match });
    if (!doc) return null;
    const title = String(doc?.title || doc?.name || doc?.slug || doc?.id || contentId);
    const text = String(doc?.description || doc?.content || doc?.short_description || doc?.longDescription || '');
    return { title, snippet: truncate(text, 4000) };
  }

  async generateInsights(
    creatorId: string,
    contentTypeRaw: string,
    contentId: string,
    from: Date,
    to: Date,
    communityId?: string,
    communitySlug?: string,
    focusStepId?: string,
  ): Promise<{ success: true; data: CreatorInsightsResponse; cached: boolean; model?: string }> {
    const contentType = normalizeContentType(contentTypeRaw);

    const promptVersion = String(this.configService.get<string>('CREATOR_INSIGHTS_PROMPT_VERSION') || 'v2');
    const key = this.cacheKey({
      creatorId,
      contentType,
      contentId,
      from: from.toISOString(),
      to: to.toISOString(),
      communityId,
      communitySlug,
      focusStepId,
      promptVersion,
    });

    const cached = await this.cacheService.get<any>(key);
    if (cached) {
      return { success: true, data: cached as CreatorInsightsResponse, cached: true, model: cached?.model };
    }

    const aiProvider = (this.configService.get<string>('AI_PROVIDER') || 'OPENROUTER').toUpperCase();
    const keyVar = aiProvider === 'OLLAMA_CLOUD' ? 'OLLAMA_API_KEY' : 'OPENROUTER_API_KEY';
    if (!this.configService.get<string>(keyVar)) {
      throw new ServiceUnavailableException('AI provider is not configured');
    }

    await this.enforceRateLimits({ creatorId, contentType, contentId });

    const funnel = await this.analyticsService.getFunnel(
      creatorId,
      contentType,
      contentId,
      from,
      to,
      communityId,
      communitySlug,
    );

    let stepFunnel: any = null;
    let resolvedFocusStepId = focusStepId ? String(focusStepId).trim() : undefined;
    if (contentType === 'course') {
      const chapters = await this.analyticsService.getCourseChaptersFunnel(
        creatorId,
        contentId,
        from,
        to,
        communityId,
        communitySlug,
      );
      stepFunnel = chapters;
      const worst = chapters?.dropOff?.worstStep?.stepId;
      if (!resolvedFocusStepId && worst) resolvedFocusStepId = String(worst);
    } else if (contentType === 'challenge') {
      const tasks = await this.analyticsService.getChallengeTasksFunnel(
        creatorId,
        contentId,
        from,
        to,
        communityId,
        communitySlug,
      );
      stepFunnel = tasks;
      const worst = tasks?.dropOff?.worstStep?.stepId;
      if (!resolvedFocusStepId && worst) resolvedFocusStepId = String(worst);
    }

    const snippet = await this.loadFocusSnippet({
      contentType,
      contentId,
      focusStepId: resolvedFocusStepId,
    });

    const systemPrompt = [
      'You are a creator analytics assistant for Chabaqa.',
      'Your job: translate real funnel + step drop-off metrics into clear explanations of WHAT is happening, WHY it is happening (root-cause hypotheses), and WHAT to do next.',
      '',
      'Hard rules:',
      '- Do NOT invent metrics, features, or content. Only use what is in the provided JSON and snippet.',
      '- If sample size is low, the signal is noisy, or tracking might be missing/incorrect, add a warning and lower confidence.',
      '- Be honest about uncertainty. Prefer multiple plausible causes over a single confident guess.',
      '- Output must be ONLY a single valid JSON object. No markdown, no backticks, no extra text.',
      '- Use the exact schema and include ALL fields (arrays can be empty, but must exist). Do not add extra keys.',
      '',
      'Quality bar (make it actionable):',
      '- "summary" must be a concise but detailed explanation in 2–4 short paragraphs:',
      '  1) What the metrics show (with key numbers/rates).',
      '  2) Why users may be dropping (2–4 hypotheses, ranked by likelihood).',
      '  3) What to do next (the highest-impact next steps).',
      '- Each item in "topIssues":',
      '  - metricEvidence MUST include concrete numbers (counts, rates, step names).',
      '  - hypothesis MUST explain the causal chain: evidence → interpretation → likely root cause → how to verify.',
      '  - confidence depends on sample size + clarity of signal + tracking completeness.',
      '- Each item in "fixes": make it specific (exact edits or actions), explain why it helps, estimate lift direction (e.g. "+5–15% starts→completes"), and include realistic risk/tradeoffs.',
      '- "rewriteSuggestions": write improved text only (do not claim it has been applied). Keep it short, clear, and creator-tone. Prefer simpler prerequisites and clearer CTAs.',
      '- "experiments": include A/B variants, a single success metric, and a reasonable duration.',
      '',
      'Required JSON schema:',
      '{',
      '  "summary": string,',
      '  "topIssues": [{ "stepId": string, "stepTitle": string, "metricEvidence": string[], "hypothesis": string, "confidence": "low"|"med"|"high" }],',
      '  "fixes": [{ "title": string, "whyItHelps": string, "exactCreatorAction": string, "expectedMetricLift": string, "risk": string }],',
      '  "rewriteSuggestions": [{ "target": "intro"|"cta"|"structure", "stepId": string, "text": string }],',
      '  "experiments": [{ "name": string, "variantA": string, "variantB": string, "successMetric": string, "runForDays": number }],',
      '  "warnings": string[]',
      '}',
      '',
      'Step alignment rules:',
      '- If step-level data exists, anchor insights to the focus step id (or worst drop-off step).',
      '- If stepTitle is unknown, use the best available title from the data; otherwise use "Step <id>".',
      '',
      'Common root-cause checklist (use only if supported by evidence/snippet):',
      '- Unclear prerequisites, mismatch between promise and content, too much cognitive load, too long/complex, weak intro/CTA, confusing structure, missing examples, friction in the UI, pricing/checkout friction (paid content), tracking gaps (missing VIEW/START/COMPLETE).',
    ].join('\n');

    const userPrompt = [
      `Content type: ${contentType}`,
      `Content id: ${contentId}`,
      `Range (UTC): ${from.toISOString()} .. ${to.toISOString()}`,
      resolvedFocusStepId ? `Focus step id: ${resolvedFocusStepId}` : 'Focus step id: auto (use worst drop-off)',
      '',
      'Your task:',
      '1) Identify the biggest drop-off points (overall funnel + step-level where available).',
      '2) Explain likely causes ("why") with a clear chain and how the creator can verify each hypothesis.',
      '3) Propose high-impact fixes, and include at least one experiment + one rewrite suggestion focused on the weakest step.',
      '',
      'Funnel metrics JSON (source of truth):',
      JSON.stringify(funnel, null, 2),
      '',
      stepFunnel ? 'Step funnel JSON (source of truth):' : 'Step funnel JSON: none',
      stepFunnel ? JSON.stringify(stepFunnel, null, 2) : '',
      '',
      snippet ? `Focus content title: ${snippet.title}` : 'Focus content title: N/A',
      snippet ? `Focus content snippet (use for rewrite suggestions only):\n${snippet.snippet}` : 'Focus content snippet: N/A',
      '',
      'Output: one JSON object that matches the required schema exactly.',
    ].join('\n');

    let lastError: any = null;
    for (const model of this.models) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: this.maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });

        const text = (completion?.choices?.[0]?.message?.content || '').toString().trim();
        if (!text) continue;

        const parsed = safeJsonExtract(text);
        const validated = validateCreatorInsightsResponse(parsed);
        if (!validated.ok) {
          const fallback: CreatorInsightsResponse = {
            summary: truncate(text, 900),
            topIssues: [],
            fixes: [],
            rewriteSuggestions: [],
            experiments: [],
            warnings: [
              'AI response was not valid JSON; returned a safe fallback summary.',
              validated.error,
            ],
          };
          await this.cacheService.set(key, { ...fallback, model }, 24 * 3600);
          return { success: true, data: fallback, cached: false, model };
        }

        const response: CreatorInsightsResponse = {
          ...validated.value,
          warnings: Array.from(new Set([...(validated.value.warnings || []), ...(funnel?.warnings || [])])),
        };

        await this.cacheService.set(key, { ...response, model }, 24 * 3600);
        return { success: true, data: response, cached: false, model };
      } catch (error) {
        lastError = error;
        this.logger.warn(`Creator insights model failed (${model}): ${(error as any)?.message || error}`);
      }
    }

    this.logger.error(`Creator insights failed across all models: ${(lastError as any)?.message || lastError}`);
    throw new ServiceUnavailableException('AI insights are temporarily unavailable');
  }
}
