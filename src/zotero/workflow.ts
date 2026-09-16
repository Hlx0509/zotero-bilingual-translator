import type { SourcePage, PDFWorkerTextResult } from '../core/page-text.js';
import { splitTextByPageChars } from '../core/page-text.js';
import type { TranslatedPage } from '../core/page-translation.js';
import type { LayoutDocument, LayoutWarning } from '../core/layout.js';
import type { TranslatedLayoutDocument } from '../core/layout-translation.js';
import type { RenderResult } from '../core/render.js';
import type { TranslationSettings } from '../core/types.js';
import { assertTranslatableAttachment, uniqueOutputPath } from './adapter.js';

export interface WorkflowAttachment {
  id: number;
  parentID: number;
  contentType: string;
  path: string;
  title: string;
}

export interface WorkflowAPI {
  getAttachment(id: number): Promise<WorkflowAttachment>;
  extractLayout(attachmentID: number): Promise<LayoutDocument>;
  extractPageText(attachmentID: number): Promise<PDFWorkerTextResult>;
  readSourcePdf(path: string): Promise<Uint8Array>;
  readFont(): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  writeAtomically(path: string, bytes: Uint8Array): Promise<void>;
  importAttachment(input: { parentItemID: number; path: string; title: string }): Promise<void>;
}

export interface WorkflowInput {
  attachmentID: number;
  api: WorkflowAPI;
  settings: TranslationSettings;
  signal: AbortSignal;
  onProgress?: (event: { phase: 'analyzing' | 'extracting' | 'translating' | 'visuals' | 'merging' | 'saving' | 'complete' }) => void;
  onFallback?: (error: unknown) => void;
  translateStructured(input: { layout: LayoutDocument }): Promise<TranslatedLayoutDocument>;
  renderStructured(input: TranslatedLayoutDocument & { title: string; sourcePdfBytes: Uint8Array; cjkFontBytes: Uint8Array }): Promise<RenderResult>;
  translate(input: { pages: SourcePage[] }): Promise<{ pages: TranslatedPage[] }>;
  render(input: { pages: TranslatedPage[]; title: string; sourcePdfBytes: Uint8Array; cjkFontBytes: Uint8Array }): Promise<Uint8Array>;
}

export interface GenerationResult {
  outputPath: string;
  mode: 'structured' | 'text-fallback';
  warnings: LayoutWarning[];
}

export async function generateBilingualAttachment(input: WorkflowInput): Promise<GenerationResult> {
  const attachment = await input.api.getAttachment(input.attachmentID);
  assertTranslatableAttachment(attachment);
  const [sourcePdfBytes, cjkFontBytes] = await Promise.all([
    input.api.readSourcePdf(attachment.path),
    input.api.readFont(),
  ]);
  input.onProgress?.({ phase: 'analyzing' });
  let layout: LayoutDocument | undefined;
  try {
    layout = await input.api.extractLayout(attachment.id);
  } catch (error) {
    input.onFallback?.(error);
  }

  let bytes: Uint8Array;
  let mode: GenerationResult['mode'];
  let warnings: LayoutWarning[] = [];
  if (layout) {
    input.onProgress?.({ phase: 'translating' });
    const translated = await input.translateStructured({ layout });
    if (input.signal.aborted) throw new Error('翻译已取消。');
    input.onProgress?.({ phase: 'visuals' });
    const rendered = await input.renderStructured({
      ...translated,
      title: attachment.title,
      sourcePdfBytes,
      cjkFontBytes,
    });
    bytes = rendered.bytes;
    warnings = rendered.warnings;
    mode = 'structured';
  } else {
    input.onProgress?.({ phase: 'extracting' });
    const pages = splitTextByPageChars(await input.api.extractPageText(attachment.id));
    if (!pages.some(page => page.text.trim())) throw new Error('此 PDF 没有可提取的文字；扫描件暂不支持。');
    input.onProgress?.({ phase: 'translating' });
    const translated = await input.translate({ pages });
    if (input.signal.aborted) throw new Error('翻译已取消。');
    input.onProgress?.({ phase: 'merging' });
    bytes = await input.render({ ...translated, title: attachment.title, sourcePdfBytes, cjkFontBytes });
    mode = 'text-fallback';
  }
  const outputPath = await uniqueOutputPath(attachment.path, input.api.exists);
  input.onProgress?.({ phase: 'saving' });
  await input.api.writeAtomically(outputPath, bytes);
  await input.api.importAttachment({ parentItemID: attachment.parentID, path: outputPath, title: `双语译文：${attachment.title}` });
  input.onProgress?.({ phase: 'complete' });
  return { outputPath, mode, warnings };
}
