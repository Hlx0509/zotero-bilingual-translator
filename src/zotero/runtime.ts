import { DeepSeekClient } from '../core/deepseek.js';
import { renderBilingualPdf } from '../core/render.js';
import { translateDocument, type TranslationCache } from '../core/orchestrator.js';
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
  return generateBilingualAttachment({
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
      async extractText(id) {
        const extracted = await Zotero.PDFWorker.getFullText(id, null, true);
        return extracted?.text ?? '';
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
    translate: ({ chunks }) => translateDocument({
      fingerprint: String(attachmentID), chunks, settings, signal: controller.signal, client, cache: memoryCache, onProgress: () => {},
    }),
    render: renderBilingualPdf,
  });
}

function readSettings(): TranslationSettings {
  return {
    apiKey: Zotero.Prefs.get('extensions.bilingualTranslator.apiKey', true),
    model: Zotero.Prefs.get('extensions.bilingualTranslator.model', true),
    targetLanguage: 'zh-CN',
    maxChunkCharacters: Number(Zotero.Prefs.get('extensions.bilingualTranslator.maxChunkCharacters', true)),
  };
}
