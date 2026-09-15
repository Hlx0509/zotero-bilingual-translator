import { describe, expect, it, vi } from 'vitest';
import { generateBilingualAttachment } from '../../src/zotero/workflow.js';

describe('generateBilingualAttachment', () => {
  it('passes source bytes and page translations to the renderer, then links the sibling PDF', async () => {
    const sourcePdfBytes = new Uint8Array([1, 2, 3]);
    const api = {
      getAttachment: vi.fn().mockResolvedValue({ id: 7, parentID: 3, contentType: 'application/pdf', path: 'C:/papers/a.pdf', title: 'A' }),
      extractPageText: vi.fn().mockResolvedValue({ text: 'First', pageChars: [5, 0] }),
      readSourcePdf: vi.fn().mockResolvedValue(sourcePdfBytes),
      readFont: vi.fn().mockResolvedValue(new Uint8Array([1])),
      exists: vi.fn().mockResolvedValue(false),
      writeAtomically: vi.fn().mockResolvedValue(undefined),
      linkAttachment: vi.fn().mockResolvedValue(undefined),
    };
    const translatedPages = {
      pages: [
        { pageNumber: 1, sourceText: 'First', translations: ['第一页。'] },
        { pageNumber: 2, sourceText: '', translations: [] },
      ],
    };
    const translate = vi.fn().mockResolvedValue(translatedPages);
    const render = vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    const progress: string[] = [];

    const output = await generateBilingualAttachment({ attachmentID: 7, api, translate, render, settings: { apiKey: 'k', model: 'deepseek-chat', targetLanguage: 'zh-CN', maxChunkCharacters: 6000 }, signal: new AbortController().signal, onProgress: (event) => progress.push(event.phase) });

    expect(output).toBe('C:/papers/a.bilingual-zh-CN.pdf');
    expect(translate).toHaveBeenCalledWith({
      pages: [
        { pageNumber: 1, text: 'First' },
        { pageNumber: 2, text: '' },
      ],
    });
    expect(render).toHaveBeenCalledWith({
      ...translatedPages,
      title: 'A',
      sourcePdfBytes,
      cjkFontBytes: new Uint8Array([1]),
    });
    expect(api.writeAtomically).toHaveBeenCalledWith(output, new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(api.linkAttachment).toHaveBeenCalledWith({ parentItemID: 3, path: output, title: '双语译文：A' });
    expect(progress).toEqual(['extracting', 'translating', 'merging', 'saving', 'complete']);
  });

  it('rejects a document only when every source page has no extractable text', async () => {
    const api = {
      getAttachment: vi.fn().mockResolvedValue({ id: 7, parentID: 3, contentType: 'application/pdf', path: 'C:/papers/a.pdf', title: 'A' }),
      extractPageText: vi.fn().mockResolvedValue({ text: '', pageChars: [0, 0] }),
      readSourcePdf: vi.fn(),
      readFont: vi.fn(),
      exists: vi.fn(),
      writeAtomically: vi.fn(),
      linkAttachment: vi.fn(),
    };

    await expect(generateBilingualAttachment({
      attachmentID: 7,
      api,
      translate: vi.fn(),
      render: vi.fn(),
      settings: { apiKey: 'k', model: 'deepseek-chat', targetLanguage: 'zh-CN', maxChunkCharacters: 6000 },
      signal: new AbortController().signal,
    })).rejects.toThrow('没有可提取的文字');
    expect(api.readSourcePdf).not.toHaveBeenCalled();
  });
});
