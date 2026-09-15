import { cacheKey } from './cache.js';
import { TranslationError } from './deepseek.js';
import type { TranslationChunk, TranslationSettings } from './types.js';

export interface TranslationCache {
  get(key: string): Promise<string[] | undefined>;
  set(key: string, translations: string[]): Promise<void>;
}

export interface TranslationClient {
  translate(chunk: TranslationChunk, signal: AbortSignal): Promise<string[]>;
}

export interface TranslationProgress {
  completedChunks: number;
  totalChunks: number;
}

export interface TranslationRequest {
  fingerprint: string;
  chunks: TranslationChunk[];
  settings: TranslationSettings;
  signal: AbortSignal;
  client: TranslationClient;
  cache: TranslationCache;
  onProgress: (progress: TranslationProgress) => void;
}

export interface TranslatedDocument {
  chunks: Array<TranslationChunk & { translations: string[] }>;
}

export async function translateDocument(request: TranslationRequest): Promise<TranslatedDocument> {
  const completed: TranslatedDocument['chunks'] = [];
  for (const chunk of request.chunks) {
    throwIfCancelled(request.signal);
    const key = await cacheKey({
      documentFingerprint: request.fingerprint,
      source: chunk.source,
      model: request.settings.model,
      targetLanguage: request.settings.targetLanguage,
    });
    throwIfCancelled(request.signal);
    const cachedTranslations = await request.cache.get(key);
    const translations = cachedTranslations ?? await request.client.translate(chunk, request.signal);
    throwIfCancelled(request.signal);
    if (translations.length !== chunk.paragraphs.length) {
      throw new TranslationError('INVALID_RESPONSE', 'Cached translation does not match the source paragraphs.');
    }
    if (cachedTranslations === undefined) await request.cache.set(key, translations);
    completed.push({ ...chunk, translations });
    request.onProgress({ completedChunks: completed.length, totalChunks: request.chunks.length });
  }
  return { chunks: completed };
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new TranslationError('CANCELLED', 'Translation was cancelled.');
}
