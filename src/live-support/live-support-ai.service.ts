import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

type SupportContextMessage = {
  senderType: 'user' | 'ai' | 'admin';
  text: string;
};

type LiveSupportReplyInput = {
  userMessage: string;
  supportStatus?: string;
  recentMessages?: SupportContextMessage[];
};

@Injectable()
export class LiveSupportAiService {
  private readonly logger = new Logger(LiveSupportAiService.name);
  private readonly client: OpenAI;
  private readonly models: string[];
  private readonly maxTokens: number;
  private readonly systemPrompt: string;

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
                'Chabaqa Live Support',
            },
          }),
    });

    const primary =
      this.configService.get<string>('SUPPORT_AI_MODEL') ||
      this.configService.get<string>('AI_MODEL') ||
      (useOllamaCloud ? 'gpt-oss:20b-cloud' : 'google/gemini-2.5-flash-lite');
    const fallback =
      this.configService.get<string>('SUPPORT_AI_FALLBACK_MODELS') ||
      this.configService.get<string>('AI_FALLBACK_MODELS') ||
      (useOllamaCloud
        ? 'minimax-m2.1:cloud,glm-4.7:cloud'
        : 'google/gemini-2.0-flash-001,google/gemini-2.0-flash-lite-001,mistralai/mistral-small-3.1-24b-instruct:free');

    this.models = [...new Set([primary.trim(), ...fallback.split(',').map((v) => v.trim()).filter(Boolean)])];
    this.maxTokens = Number(this.configService.get<string>('SUPPORT_AI_MAX_OUTPUT_TOKENS') || 600);
    this.systemPrompt =
      this.configService.get<string>('SUPPORT_AI_SYSTEM_PROMPT') ||
      'You are Chabaqa support assistant. Be concise, practical, and accurate. Do not invent policy or account details. If uncertain, ask user to click Request Admin for human support. Reply in the same language as the user.';
  }

  async reply(input: LiveSupportReplyInput): Promise<{ text: string; model: string }> {
    const aiProvider = (
      this.configService.get<string>('AI_PROVIDER') || 'OPENROUTER'
    ).toUpperCase();
    const keyVar = aiProvider === 'OLLAMA_CLOUD' ? 'OLLAMA_API_KEY' : 'OPENROUTER_API_KEY';
    if (!this.configService.get<string>(keyVar)) {
      throw new ServiceUnavailableException('AI provider is not configured');
    }

    const latestUserMessage = String(input.userMessage || '').trim();
    const recentMessages = (input.recentMessages || [])
      .slice(-12)
      .map((message, index) => {
        const sender =
          message.senderType === 'user'
            ? 'User'
            : message.senderType === 'admin'
              ? 'Admin'
              : 'AI';
        const text = String(message.text || '').replace(/\s+/g, ' ').trim();
        return `${index + 1}. ${sender}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');

    const supportContext = [
      `Ticket status: ${input.supportStatus || 'BOT_ACTIVE'}`,
      recentMessages ? `Recent conversation:\n${recentMessages}` : 'Recent conversation: none',
      `Latest user message:\n${latestUserMessage}`,
      'Instructions: answer concisely with practical next steps and do not fabricate account facts.',
      'If action needs a human agent or certainty is low, ask the user to click Request Admin.',
    ].join('\n\n');

    let lastError: any = null;
    for (const model of this.models) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: Math.max(128, Math.min(this.maxTokens, 2000)),
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: supportContext },
          ],
        });

        const text = (completion?.choices?.[0]?.message?.content || '').toString().trim();
        if (text) return { text, model };
      } catch (error) {
        lastError = error;
        this.logger.warn(`Support AI model failed (${model}): ${(error as any)?.message || error}`);
      }
    }

    this.logger.error(`Support AI failed across all models: ${(lastError as any)?.message || lastError}`);
    throw new ServiceUnavailableException('AI support is temporarily unavailable');
  }
}
