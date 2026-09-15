import { DeepSeekClient } from '../core/deepseek.js';
import { buildLayoutDocument } from '../core/layout.js';
import { translateLayout } from '../core/layout-translation.js';
import { renderBilingualPdf, renderStructuredBilingualPdf } from '../core/render.js';
import { decodeSDTPack } from '../core/sdt-pack.js';
import type { TranslationCache } from '../core/orchestrator.js';
import { translatePages } from '../core/page-translation.js';
import type { TranslationSettings } from '../core/types.js';
import { generateBilingualAttachment } from './workflow.js';

declare const Zotero: any;
declare const IOUtils: any;

const cache = new Map<string, string[]>();
const memoryCache: TranslationCache = {
  async get(key) { return cache.get(key); },
  async set(key, translations) { cache.set(key, translations); },
};

export async function translateSelectedAttachment(rootURI: string, attachmentID: number): Promise<string> {
  const settings = readSettings();
  if (!settings.apiKey.trim()) throw new Error('请先在 Zotero 设置中填写 DeepSeek API Key。');
  const { AbortController } = Zotero.getMainWindow();
  const controller = new AbortController();
  const client = new DeepSeekClient({ apiKey: settings.apiKey, model: settings.model });
  const progress = new Zotero.ProgressWindow({ window: Zotero.getMainWindow(), closeOnClick: false });
  progress.changeHeadline('生成中英双语 PDF');
  const indicator = new progress.ItemProgress('attachment', '准备中');
  indicator.setProgress(0);
  progress.show();
  try {
    const result = await generateBilingualAttachment({
    attachmentID,
    settings,
    signal: controller.signal,
    api: {
      async getAttachment(id) {
        const item = await Zotero.Items.getAsync(id);
        const path = await item.getFilePathAsync();
        if (!path) throw new Error('找不到 PDF 附件文件。');
        return { id, parentID: item.parentID, contentType: item.attachmentContentType, path, title: item.getDisplayTitle() };
      },
      async extractLayout(id) {
        const extracted = await Zotero.PDFWorker.getStructuredDocumentText(id, {
          isPriority: true,
          onProgress: (event: unknown) => {
            const raw = typeof event === 'number' ? event : Number((event as { progress?: unknown })?.progress);
            if (Number.isFinite(raw)) indicator.setProgress(Math.round(Math.max(0, Math.min(100, raw)) * 0.15));
          },
        });
        if (!extracted?.buf) throw new Error('Zotero 未返回结构化版面数据。');
        return buildLayoutDocument(decodeSDTPack(new Uint8Array(extracted.buf)));
      },
      async extractPageText(id) {
        const extracted = await Zotero.PDFWorker.getFullText(id, null, true);
        return {
          text: extracted?.text ?? '',
          pageChars: Array.isArray(extracted?.pageChars) ? extracted.pageChars : undefined,
          extractedPages: Number.isInteger(extracted?.extractedPages) ? extracted.extractedPages : undefined,
          totalPages: Number.isInteger(extracted?.totalPages) ? extracted.totalPages : undefined,
        };
      },
      async readSourcePdf(path) {
        return new Uint8Array(await IOUtils.read(path));
      },
      async readFont() {
        const response = await fetch(`${rootURI}assets/NotoSansSC-VF.ttf`);
        if (!response.ok) throw new Error('未能加载中文字体资源。');
        return new Uint8Array(await response.arrayBuffer());
      },
      exists: (path) => IOUtils.exists(path),
      async writeAtomically(path, bytes) {
        const temporaryPath = `${path}.part`;
        await IOUtils.write(temporaryPath, bytes);
        await IOUtils.move(temporaryPath, path, { noOverwrite: true });
      },
      async linkAttachment({ parentItemID, path, title }) {
        await Zotero.Attachments.linkFromFile({ parentItemID, file: path, title, contentType: 'application/pdf' });
      },
    },
    translateStructured: ({ layout }) => translateLayout({
      documentFingerprint: String(attachmentID), layout, settings, signal: controller.signal, client, cache: memoryCache,
      onProgress: ({ pageNumber, totalPages, completedTextBlocks, totalTextBlocks }) => {
        indicator.setText(`正在翻译第 ${pageNumber} / ${totalPages} 页（文本块 ${completedTextBlocks} / ${totalTextBlocks}）`);
        const fraction = totalTextBlocks ? completedTextBlocks / totalTextBlocks : 1;
        indicator.setProgress(Math.round(15 + fraction * 60));
      },
    }),
    renderStructured: renderStructuredBilingualPdf,
    translate: ({ pages }) => translatePages({
      fingerprint: String(attachmentID), pages, settings, signal: controller.signal, client, cache: memoryCache,
      onProgress: ({ pageNumber, totalPages, completedChunks, totalChunks }) => {
        const detail = totalChunks ? `${completedChunks} / ${totalChunks} 段` : '无可翻译文本';
        indicator.setText(`正在翻译第 ${pageNumber} / ${totalPages} 页（${detail}）`);
        const pageFraction = totalChunks ? completedChunks / totalChunks : 1;
        indicator.setProgress(Math.round(15 + ((pageNumber - 1 + pageFraction) / totalPages) * 60));
      },
    }),
    render: renderBilingualPdf,
    onFallback: (error) => {
      Zotero.debug(`Bilingual Translator: structured layout unavailable, using text fallback: ${String(error)}`, 2);
    },
    onProgress: ({ phase }) => {
      const labels = {
        analyzing: '正在分析 PDF 版面',
        extracting: '正在提取 PDF 分页文本（回退模式）',
        translating: '正在翻译文本',
        visuals: '正在提取并放置图片、公式和表格',
        merging: '正在合并原文页与译文页',
        saving: '正在保存并添加附件',
        complete: '已完成',
      };
      indicator.setText(labels[phase]);
      const percentages = { analyzing: 0, extracting: 15, translating: 15, visuals: 75, merging: 75, saving: 92, complete: 100 };
      indicator.setProgress(percentages[phase]);
    },
  });
    indicator.setText(result.mode === 'text-fallback'
      ? '已完成（已回退为纯文本译文）'
      : result.warnings.length
        ? `已完成，但有 ${result.warnings.length} 个元素未能放置`
        : '已完成（含图片、公式和表格）');
    indicator.setProgress(100);
    progress.startCloseTimer(3000);
    return result.outputPath;
  } catch (error) {
    indicator.setText(error instanceof Error ? error.message : '生成失败。');
    indicator.setError();
    progress.startCloseTimer(8000);
    throw error;
  }
}

function readSettings(): TranslationSettings {
  return {
    apiKey: Zotero.Prefs.get('extensions.bilingualTranslator.apiKey', true),
    model: Zotero.Prefs.get('extensions.bilingualTranslator.model', true),
    targetLanguage: 'zh-CN',
    maxChunkCharacters: Number(Zotero.Prefs.get('extensions.bilingualTranslator.maxChunkCharacters', true)),
  };
}
