import type { SourcePage, PDFWorkerTextResult } from '../core/page-text.js';
import { splitTextByPageChars } from '../core/page-text.js';
import type { TranslatedPage } from '../core/page-translation.js';
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
  extractPageText(attachmentID: number): Promise<PDFWorkerTextResult>;
  readSourcePdf(path: string): Promise<Uint8Array>;
  readFont(): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  writeAtomically(path: string, bytes: Uint8Array): Promise<void>;
  linkAttachment(input: { parentItemID: number; path: string; title: string }): Promise<void>;
}

export interface WorkflowInput {
  attachmentID: number;
  api: WorkflowAPI;
  settings: TranslationSettings;
  signal: AbortSignal;
  onProgress?: (event: { phase: 'extracting' | 'translating' | 'merging' | 'saving' | 'complete' }) => void;
  translate(input: { pages: SourcePage[] }): Promise<{ pages: TranslatedPage[] }>;
  render(input: { pages: TranslatedPage[]; title: string; sourcePdfBytes: Uint8Array; cjkFontBytes: Uint8Array }): Promise<Uint8Array>;
}

export async function generateBilingualAttachment(input: WorkflowInput): Promise<string> {
  const attachment = await input.api.getAttachment(input.attachmentID);
  assertTranslatableAttachment(attachment);
  input.onProgress?.({ phase: 'extracting' });
  const pages = splitTextByPageChars(await input.api.extractPageText(attachment.id));
  if (!pages.some(page => page.text.trim())) throw new Error('此 PDF 没有可提取的文字；扫描件暂不支持。');

  input.onProgress?.({ phase: 'translating' });
  const translated = await input.translate({ pages });
  if (input.signal.aborted) throw new Error('翻译已取消。');
  input.onProgress?.({ phase: 'merging' });
  const [sourcePdfBytes, cjkFontBytes] = await Promise.all([
    input.api.readSourcePdf(attachment.path),
    input.api.readFont(),
  ]);
  const bytes = await input.render({ ...translated, title: attachment.title, sourcePdfBytes, cjkFontBytes });
  const outputPath = await uniqueOutputPath(attachment.path, input.api.exists);
  input.onProgress?.({ phase: 'saving' });
  await input.api.writeAtomically(outputPath, bytes);
  await input.api.linkAttachment({ parentItemID: attachment.parentID, path: outputPath, title: `双语译文：${attachment.title}` });
  input.onProgress?.({ phase: 'complete' });
  return outputPath;
}
