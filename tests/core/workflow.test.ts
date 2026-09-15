import { describe, expect, it, vi } from 'vitest';
import { generateBilingualAttachment } from '../../src/zotero/workflow.js';
import type { LayoutDocument } from '../../src/core/layout.js';

const settings = { apiKey: 'k', model: 'deepseek-chat', targetLanguage: 'zh-CN' as const, maxChunkCharacters: 6000 };
const attachment = { id: 7, parentID: 3, contentType: 'application/pdf', path: 'C:/papers/a.pdf', title: 'A' };
const sourcePdfBytes = new Uint8Array([1, 2, 3]);
const fontBytes = new Uint8Array([4, 5]);
const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const layout: LayoutDocument = {
  pages: [{ pageNumber: 1, blocks: [{ id: 'p1', type: 'text', role: 'paragraph', sourceText: 'First' }] }],
  warnings: [],
};

describe('generateBilingualAttachment', () => {
  it('uses structured layout and does not invoke text fallback on success', async () => {
    const api = makeAPI();
    const translatedLayout = { pages: [{ pageNumber: 1, blocks: [{ ...layout.pages[0].blocks[0], translations: ['第一段'] }] }], warnings: [] };
    const translateStructured = vi.fn().mockResolvedValue(translatedLayout);
    const renderStructured = vi.fn().mockResolvedValue({ bytes: pdfBytes, warnings: [] });

    const result = await generateBilingualAttachment({
      attachmentID: 7, api, settings, signal: new AbortController().signal,
      translateStructured, renderStructured,
      translate: vi.fn(), render: vi.fn(),
    });

    expect(result).toEqual({ outputPath: 'C:/papers/a.bilingual-zh-CN.pdf', mode: 'structured', warnings: [] });
    expect(api.extractPageText).not.toHaveBeenCalled();
    expect(translateStructured).toHaveBeenCalledWith({ layout });
    expect(renderStructured).toHaveBeenCalledWith({
      ...translatedLayout, title: 'A', sourcePdfBytes, cjkFontBytes: fontBytes,
    });
    expect(api.writeAtomically).toHaveBeenCalledWith(result.outputPath, pdfBytes);
  });

  it('falls back to page text only when structured extraction fails', async () => {
    const api = makeAPI();
    api.extractLayout.mockRejectedValue(new Error('SDT unavailable'));
    api.extractPageText.mockResolvedValue({ text: 'First', pageChars: [5] });
    const translatedPages = { pages: [{ pageNumber: 1, sourceText: 'First', translations: ['第一段'] }] };
    const translate = vi.fn().mockResolvedValue(translatedPages);
    const render = vi.fn().mockResolvedValue(pdfBytes);

    const result = await generateBilingualAttachment({
      attachmentID: 7, api, settings, signal: new AbortController().signal,
      translateStructured: vi.fn(), renderStructured: vi.fn(), translate, render,
    });

    expect(result.mode).toBe('text-fallback');
    expect(translate).toHaveBeenCalledWith({ pages: [{ pageNumber: 1, text: 'First' }] });
    expect(render).toHaveBeenCalledWith({
      ...translatedPages, title: 'A', sourcePdfBytes, cjkFontBytes: fontBytes,
    });
  });

  it('propagates structured translation failures without starting fallback', async () => {
    const api = makeAPI();
    await expect(generateBilingualAttachment({
      attachmentID: 7, api, settings, signal: new AbortController().signal,
      translateStructured: vi.fn().mockRejectedValue(new Error('DeepSeek failed')),
      renderStructured: vi.fn(), translate: vi.fn(), render: vi.fn(),
    })).rejects.toThrow('DeepSeek failed');
    expect(api.extractPageText).not.toHaveBeenCalled();
  });
});

function makeAPI() {
  return {
    getAttachment: vi.fn().mockResolvedValue(attachment),
    extractLayout: vi.fn().mockResolvedValue(layout),
    extractPageText: vi.fn(),
    readSourcePdf: vi.fn().mockResolvedValue(sourcePdfBytes),
    readFont: vi.fn().mockResolvedValue(fontBytes),
    exists: vi.fn().mockResolvedValue(false),
    writeAtomically: vi.fn().mockResolvedValue(undefined),
    linkAttachment: vi.fn().mockResolvedValue(undefined),
  };
}
