import { describe, expect, it, vi } from 'vitest';
import { translateLayout } from '../../src/core/layout-translation.js';
import type { LayoutDocument } from '../../src/core/layout.js';

describe('translateLayout', () => {
  it('translates only text blocks while preserving every block ID and position', async () => {
    const layout: LayoutDocument = {
      pages: [{ pageNumber: 1, blocks: [
        { id: 'h1', type: 'text', role: 'heading', sourceText: 'Heading' },
        { id: 'p1', type: 'text', role: 'paragraph', sourceText: 'Body text' },
        { id: 'img1', type: 'visual', role: 'image', pageNumber: 1, rect: [10, 20, 100, 120] },
        { id: 'cap1', type: 'text', role: 'caption', sourceText: 'Figure caption' },
      ] }],
      warnings: [],
    };
    const clientSources: string[] = [];
    const progress: Array<{ completedTextBlocks: number; totalTextBlocks: number }> = [];

    const result = await translateLayout({
      documentFingerprint: 'paper',
      layout,
      settings: { apiKey: 'k', model: 'deepseek-chat', targetLanguage: 'zh-CN', maxChunkCharacters: 256 },
      signal: new AbortController().signal,
      client: { translate: vi.fn(async chunk => {
        clientSources.push(chunk.source);
        return chunk.paragraphs.map(text => `译:${text}`);
      }) },
      cache: { get: async () => undefined, set: async () => undefined },
      onProgress: event => progress.push(event),
    });

    expect(clientSources).toEqual(['Heading', 'Body text', 'Figure caption']);
    expect(result.pages[0].blocks.map(block => block.id)).toEqual(['h1', 'p1', 'img1', 'cap1']);
    expect(result.pages[0].blocks[0]).toMatchObject({ role: 'heading', translations: ['译:Heading'] });
    expect(result.pages[0].blocks[2]).toEqual(layout.pages[0].blocks[2]);
    expect(progress.at(-1)).toMatchObject({ completedTextBlocks: 3, totalTextBlocks: 3 });
  });

  it('does not call DeepSeek for a visual-only page', async () => {
    const translate = vi.fn();
    const result = await translateLayout({
      documentFingerprint: 'paper',
      layout: {
        pages: [{ pageNumber: 1, blocks: [
          { id: 'table1', type: 'visual', role: 'table', pageNumber: 1, rect: [10, 20, 200, 300] },
        ] }],
        warnings: [],
      },
      settings: { apiKey: 'k', model: 'deepseek-chat', targetLanguage: 'zh-CN', maxChunkCharacters: 256 },
      signal: new AbortController().signal,
      client: { translate },
      cache: { get: async () => undefined, set: async () => undefined },
      onProgress: () => undefined,
    });

    expect(translate).not.toHaveBeenCalled();
    expect(result.pages[0].blocks[0]).toMatchObject({ type: 'visual', role: 'table' });
  });
});
