import { describe, expect, it, vi } from 'vitest';
import { translatePages } from '../../src/core/page-translation.js';

describe('translatePages', () => {
  it('keeps page numbers and skips translation calls for blank pages', async () => {
    const client = { translate: vi.fn(async chunk => chunk.paragraphs.map(text => `译:${text}`)) };
    const progress: Array<{ pageNumber: number; totalPages: number; completedChunks: number; totalChunks: number }> = [];

    const result = await translatePages({
      fingerprint: 'paper',
      pages: [
        { pageNumber: 1, text: 'First page.' },
        { pageNumber: 2, text: '  \n' },
        { pageNumber: 3, text: 'Third page.' },
      ],
      settings: { apiKey: 'k', model: 'deepseek-chat', targetLanguage: 'zh-CN', maxChunkCharacters: 256 },
      signal: new AbortController().signal,
      client,
      cache: { get: vi.fn().mockResolvedValue(undefined), set: vi.fn().mockResolvedValue(undefined) },
      onProgress: event => progress.push(event),
    });

    expect(result.pages).toEqual([
      { pageNumber: 1, sourceText: 'First page.', translations: ['译:First page.'] },
      { pageNumber: 2, sourceText: '', translations: [] },
      { pageNumber: 3, sourceText: 'Third page.', translations: ['译:Third page.'] },
    ]);
    expect(client.translate).toHaveBeenCalledTimes(2);
    expect(progress).toContainEqual({ pageNumber: 2, totalPages: 3, completedChunks: 0, totalChunks: 0 });
  });

  it('chunks long page text and reports chunk progress for that page', async () => {
    const progress: Array<{ pageNumber: number; totalPages: number; completedChunks: number; totalChunks: number }> = [];
    const result = await translatePages({
      fingerprint: 'paper',
      pages: [{ pageNumber: 4, text: 'A'.repeat(300) }],
      settings: { apiKey: 'k', model: 'deepseek-chat', targetLanguage: 'zh-CN', maxChunkCharacters: 256 },
      signal: new AbortController().signal,
      client: { translate: async chunk => chunk.paragraphs.map(text => `译:${text}`) },
      cache: { get: async () => undefined, set: async () => undefined },
      onProgress: event => progress.push(event),
    });

    expect(result.pages[0].translations).toHaveLength(2);
    expect(progress).toEqual([
      { pageNumber: 4, totalPages: 1, completedChunks: 1, totalChunks: 2 },
      { pageNumber: 4, totalPages: 1, completedChunks: 2, totalChunks: 2 },
    ]);
  });
});
