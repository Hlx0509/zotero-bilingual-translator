import { chunkParagraphs, normalizeParagraphs } from '../core/chunking.js';
import type { TranslatedDocument } from '../core/orchestrator.js';
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
  extractText(attachmentID: number): Promise<string>;
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
  translate(input: { chunks: ReturnType<typeof chunkParagraphs> }): Promise<TranslatedDocument>;
  render(input: TranslatedDocument & { title: string; cjkFontBytes: Uint8Array }): Promise<Uint8Array>;
}

export async function generateBilingualAttachment(input: WorkflowInput): Promise<string> {
  const attachment = await input.api.getAttachment(input.attachmentID);
  assertTranslatableAttachment(attachment);
  const paragraphs = normalizeParagraphs(await input.api.extractText(attachment.id));
  if (!paragraphs.length) throw new Error('此 PDF 没有可提取的文字；扫描件暂不支持。');

  const translated = await input.translate({ chunks: chunkParagraphs(paragraphs, input.settings.maxChunkCharacters) });
  if (input.signal.aborted) throw new Error('翻译已取消。');
  const bytes = await input.render({ ...translated, title: attachment.title, cjkFontBytes: await input.api.readFont() });
  const outputPath = await uniqueOutputPath(attachment.path, input.api.exists);
  await input.api.writeAtomically(outputPath, bytes);
  await input.api.linkAttachment({ parentItemID: attachment.parentID, path: outputPath, title: `双语译文：${attachment.title}` });
  return outputPath;
}
