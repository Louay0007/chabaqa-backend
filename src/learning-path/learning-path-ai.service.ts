import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export type LearningPathAiCandidate = {
  id: string;
  type: string;
  title: string;
  description?: string;
  communityId?: string;
  score: number;
};

export type LearningPathAiResult = {
  id: string;
  rank: number;
  reason: string;
};

@Injectable()
export class LearningPathAiService {
  private readonly logger = new Logger(LearningPathAiService.name);
  private readonly client: OpenAI;
  private readonly models: string[];
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(private readonly configService: ConfigService) {
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
                'Chabaqa Learning Path',
            },
          }),
    });

    const primary =
      this.configService.get<string>('LEARNING_PATH_AI_MODEL') ||
      this.configService.get<string>('AI_MODEL') ||
      (useOllamaCloud ? 'gpt-oss:20b-cloud' : 'google/gemini-2.5-flash-lite');
    const fallback =
      this.configService.get<string>('LEARNING_PATH_AI_FALLBACK_MODELS') ||
      this.configService.get<string>('AI_FALLBACK_MODELS') ||
      (useOllamaCloud
        ? 'minimax-m2.1:cloud,glm-4.7:cloud'
        : 'google/gemini-2.0-flash-001,google/gemini-2.0-flash-lite-001,mistralai/mistral-small-3.1-24b-instruct:free');

    this.models = [
      ...new Set(
        [primary.trim(), ...fallback.split(',').map((v) => v.trim())].filter(
          Boolean,
        ),
      ),
    ];
    this.maxTokens = Number(
      this.configService.get<string>('LEARNING_PATH_AI_MAX_OUTPUT_TOKENS') || 700,
    );
    this.temperature = Number(
      this.configService.get<string>('LEARNING_PATH_AI_TEMPERATURE') || 0.2,
    );
  }

  hasApiKey(): boolean {
    const aiProvider = (
      this.configService.get<string>('AI_PROVIDER') || 'OPENROUTER'
    ).toUpperCase();
    const keyVar = aiProvider === 'OLLAMA_CLOUD' ? 'OLLAMA_API_KEY' : 'OPENROUTER_API_KEY';
    return Boolean(this.configService.get<string>(keyVar));
  }

  async rerank(
    goals: string,
    candidates: LearningPathAiCandidate[],
    limit: number,
  ): Promise<LearningPathAiResult[] | null> {
    if (!this.hasApiKey()) {
      this.logger.warn('Learning path AI key missing, falling back to heuristic ranking');
      return null;
    }

    const list = candidates.map((c, index) => ({
      id: c.id,
      type: c.type,
      title: c.title,
      description: c.description?.slice(0, 240) || '',
      communityId: c.communityId || '',
      score: c.score,
      index,
    }));

    const prompt = [
      'You are an AI learning path ranker.',
      'Given learner goals and a candidate list, return a JSON array ranking the best items.',
      'Only use provided candidates. Do not invent items.',
      'Return JSON array like: [{"id":"...","rank":1,"reason":"short rationale"}, ...]',
      `Goals: ${goals}`,
      `Limit: ${limit}`,
      `Candidates: ${JSON.stringify(list)}`,
    ].join('\n\n');

    let lastError: any = null;
    for (const model of this.models) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          temperature: this.temperature,
          max_tokens: Math.max(128, Math.min(this.maxTokens, 2000)),
          messages: [
            {
              role: 'system',
              content:
                'Return ONLY valid JSON. Keep reasons under 20 words. Rank from 1 (best).',
            },
            { role: 'user', content: prompt },
          ],
        });

        const raw =
          completion?.choices?.[0]?.message?.content?.toString().trim() || '';
        if (!raw) {
          throw new Error('Empty AI response');
        }

        const parsed = this.parseJsonArray(raw);
        if (!parsed) {
          throw new Error('Invalid JSON response');
        }

        return parsed
          .map((item, idx) => ({
            id: String(item.id || ''),
            rank: Number(item.rank ?? idx + 1),
            reason: String(item.reason || '').trim(),
          }))
          .filter((item) => item.id && item.reason);
      } catch (error) {
        lastError = error;
        this.logger.warn(`Learning path AI failed (${model}): ${(error as any)?.message || error}`);
      }
    }

    this.logger.error(
      `Learning path AI failed across all models: ${(lastError as any)?.message || lastError}`,
    );
    return null;
  }

  private parseJsonArray(raw: string): any[] | null {
    try {
      const direct = JSON.parse(raw);
      if (Array.isArray(direct)) return direct;
    } catch {
      // ignore
    }

    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return null;

    const slice = raw.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
