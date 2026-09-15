import { chunkParagraphs, normalizeParagraphs } from './chunking.js';
import { translateDocument, type TranslationCache, type TranslationClient } from './orchestrator.js';
import type { SourcePage } from './page-text.js';
import type { TranslationSettings } from './types.js';

export interface TranslatedPage {
  pageNumber: number;
  sourceText: string;
  translations: string[];
}

export interface PageTranslationProgress {
  pageNumber: number;
  totalPages: number;
  completedChunks: number;
  totalChunks: number;
}

export interface TranslatePagesRequest {
  fingerprint: string;
  pages: SourcePage[];
  settings: TranslationSettings;
  signal: AbortSignal;
  client: TranslationClient;
  cache: TranslationCache;
  onProgress: (progress: PageTranslationProgress) => void;
}

export async function translatePages(request: TranslatePagesRequest): Promise<{ pages: TranslatedPage[] }> {
  const pages: TranslatedPage[] = [];
  for (const sourcePage of request.pages) {
    const paragraphs = normalizeParagraphs(sourcePage.text);
    const sourceText = paragraphs.join('\n\n');
    if (!paragraphs.length) {
      pages.push({ pageNumber: sourcePage.pageNumber, sourceText, translations: [] });
      request.onProgress({
        pageNumber: sourcePage.pageNumber,
        totalPages: request.pages.length,
        completedChunks: 0,
        totalChunks: 0,
      });
      continue;
    }

    const chunks = chunkParagraphs(paragraphs, request.settings.maxChunkCharacters);
    const translated = await translateDocument({
      fingerprint: `${request.fingerprint}:page:${sourcePage.pageNumber}`,
      chunks,
      settings: request.settings,
      signal: request.signal,
      client: request.client,
      cache: request.cache,
      onProgress: progress => request.onProgress({
        pageNumber: sourcePage.pageNumber,
        totalPages: request.pages.length,
        ...progress,
      }),
    });
    pages.push({
      pageNumber: sourcePage.pageNumber,
      sourceText,
      translations: translated.chunks.flatMap(chunk => chunk.translations),
    });
  }
  return { pages };
}
