import { chunkParagraphs, normalizeParagraphs } from './chunking.js';
import type { LayoutDocument, LayoutTextBlock, LayoutVisualBlock, LayoutWarning } from './layout.js';
import { translateDocument, type TranslationCache, type TranslationClient } from './orchestrator.js';
import type { TranslationSettings } from './types.js';

export type TranslatedLayoutBlock = (LayoutTextBlock & { translations: string[] }) | LayoutVisualBlock;
export interface TranslatedLayoutDocument {
  pages: Array<{ pageNumber: number; blocks: TranslatedLayoutBlock[] }>;
  warnings: LayoutWarning[];
}

export interface LayoutTranslationProgress {
  pageNumber: number;
  totalPages: number;
  completedTextBlocks: number;
  totalTextBlocks: number;
  completedChunks: number;
  totalChunks: number;
}

export interface TranslateLayoutRequest {
  documentFingerprint: string;
  layout: LayoutDocument;
  settings: TranslationSettings;
  signal: AbortSignal;
  client: TranslationClient;
  cache: TranslationCache;
  onProgress: (progress: LayoutTranslationProgress) => void;
}

export async function translateLayout(request: TranslateLayoutRequest): Promise<TranslatedLayoutDocument> {
  const totalTextBlocks = request.layout.pages.reduce(
    (total, page) => total + page.blocks.filter(block => block.type === 'text' && block.sourceText.trim()).length,
    0,
  );
  let completedTextBlocks = 0;
  const pages: TranslatedLayoutDocument['pages'] = [];

  for (const page of request.layout.pages) {
    const blocks: TranslatedLayoutBlock[] = [];
    for (const block of page.blocks) {
      if (block.type === 'visual') {
        blocks.push(block);
        continue;
      }
      const paragraphs = normalizeParagraphs(block.sourceText);
      if (!paragraphs.length) {
        blocks.push({ ...block, translations: [] });
        continue;
      }
      const chunks = chunkParagraphs(paragraphs, request.settings.maxChunkCharacters);
      const translated = await translateDocument({
        fingerprint: `${request.documentFingerprint}:block:${block.id}`,
        chunks,
        settings: request.settings,
        signal: request.signal,
        client: request.client,
        cache: request.cache,
        onProgress: ({ completedChunks, totalChunks }) => request.onProgress({
          pageNumber: page.pageNumber,
          totalPages: request.layout.pages.length,
          completedTextBlocks,
          totalTextBlocks,
          completedChunks,
          totalChunks,
        }),
      });
      completedTextBlocks += 1;
      blocks.push({ ...block, translations: translated.chunks.flatMap(chunk => chunk.translations) });
      request.onProgress({
        pageNumber: page.pageNumber,
        totalPages: request.layout.pages.length,
        completedTextBlocks,
        totalTextBlocks,
        completedChunks: chunks.length,
        totalChunks: chunks.length,
      });
    }
    pages.push({ pageNumber: page.pageNumber, blocks });
  }
  return { pages, warnings: [...request.layout.warnings] };
}
