import { describe, expect, it, vi } from 'vitest';
import { generateBilingualAttachment } from '../../src/zotero/workflow.js';

describe('generateBilingualAttachment', () => {
  it('writes a completed sibling PDF and links it to the parent item', async () => {
    const api = {
      getAttachment: vi.fn().mockResolvedValue({ id: 7, parentID: 3, contentType: 'application/pdf', path: 'C:/papers/a.pdf', title: 'A' }),
      extractText: vi.fn().mockResolvedValue('First paragraph.\n\nSecond paragraph.'),
      readFont: vi.fn().mockResolvedValue(new Uint8Array([1])),
      exists: vi.fn().mockResolvedValue(false),
      writeAtomically: vi.fn().mockResolvedValue(undefined),
      linkAttachment: vi.fn().mockResolvedValue(undefined),
    };
    const translate = vi.fn().mockResolvedValue({ chunks: [{ id: '0', paragraphs: ['First paragraph.', 'Second paragraph.'], source: 'First paragraph.\n\nSecond paragraph.', translations: ['第一段。', '第二段。'] }] });
    const render = vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    const output = await generateBilingualAttachment({ attachmentID: 7, api, translate, render, settings: { apiKey: 'k', model: 'deepseek-chat', targetLanguage: 'zh-CN', maxChunkCharacters: 6000 }, signal: new AbortController().signal });

    expect(output).toBe('C:/papers/a.bilingual-zh-CN.pdf');
    expect(api.writeAtomically).toHaveBeenCalledWith(output, new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(api.linkAttachment).toHaveBeenCalledWith({ parentItemID: 3, path: output, title: '双语译文：A' });
  });
});
