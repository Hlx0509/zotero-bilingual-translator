import type { TranslationChunk } from './types.js';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const RETRY_DELAYS_MS = [500, 1000, 2000];
const SYSTEM_PROMPT = [
  'Translate each source paragraph into Simplified Chinese.',
  'Return JSON only, exactly as {"translations":["..."]}.',
  'Return exactly one nonempty translation for every input paragraph in the same order.',
  'Preserve formulas, citation markers, URLs, code, terminology, and paragraph boundaries.',
].join(' ');

export type TranslationErrorCode = 'AUTH' | 'RATE_LIMIT' | 'NETWORK' | 'INVALID_RESPONSE' | 'CANCELLED';

export class TranslationError extends Error {
  constructor(readonly code: TranslationErrorCode, message: string) {
    super(message);
    this.name = 'TranslationError';
  }
}

interface ClientOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class DeepSeekClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: ClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async translate(chunk: TranslationChunk, signal: AbortSignal): Promise<string[]> {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      this.throwIfCancelled(signal);
      try {
        const response = await this.fetchImpl(ENDPOINT, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: JSON.stringify({ paragraphs: chunk.paragraphs }) },
            ],
          }),
        });

        if (response.ok) return this.parseTranslations(await response.json(), chunk.paragraphs.length);
        if (response.status === 401 || response.status === 403) throw new TranslationError('AUTH', 'DeepSeek API key was rejected.');
        if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS_MS.length) {
          await this.sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new TranslationError(response.status === 429 ? 'RATE_LIMIT' : 'NETWORK', 'DeepSeek request failed.');
      } catch (error) {
        if (error instanceof TranslationError) throw error;
        if (signal.aborted) throw new TranslationError('CANCELLED', 'Translation was cancelled.');
        if (attempt < RETRY_DELAYS_MS.length) {
          await this.sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new TranslationError('NETWORK', 'Unable to reach DeepSeek.');
      }
    }
    throw new TranslationError('NETWORK', 'Unable to reach DeepSeek.');
  }

  private parseTranslations(payload: unknown, paragraphCount: number): string[] {
    const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new TranslationError('INVALID_RESPONSE', 'DeepSeek returned no translation content.');
    try {
      const parsed = JSON.parse(content) as { translations?: unknown };
      if (!Array.isArray(parsed.translations) || parsed.translations.length !== paragraphCount || parsed.translations.some((value) => typeof value !== 'string' || !value.trim())) {
        throw new Error('Invalid translation shape');
      }
      return parsed.translations;
    } catch {
      throw new TranslationError('INVALID_RESPONSE', 'DeepSeek returned an invalid translation response.');
    }
  }

  private throwIfCancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new TranslationError('CANCELLED', 'Translation was cancelled.');
  }
}
