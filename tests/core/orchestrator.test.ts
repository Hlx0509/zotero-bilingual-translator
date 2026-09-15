import { describe, expect, it, vi } from 'vitest';
import { translateDocument } from '../../src/core/orchestrator.js';

describe('translateDocument', () => {
  it('uses a cached chunk and reports completion for the full document', async () => {
    const chunks = [
      { id: '0', paragraphs: ['One'], source: 'One' },
      { id: '1', paragraphs: ['Two'], source: 'Two' },
    ];
    const client = { translate: vi.fn().mockResolvedValue(['二']) };
    const cache = {
      get: vi.fn().mockResolvedValueOnce(['一']).mockResolvedValueOnce(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const progress: Array<{ completedChunks: number; totalChunks: number }> = [];

    const result = await translateDocument({
      fingerprint: 'document-1',
      chunks,
      settings: { apiKey: 'secret', model: 'deepseek-chat', targetLanguage: 'zh-CN', maxChunkCharacters: 6000 },
      signal: new AbortController().signal,
      client,
      cache,
      onProgress: (event) => progress.push(event),
    });

    expect(result.chunks.map((chunk) => chunk.translations)).toEqual([['一'], ['二']]);
    expect(client.translate).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toEqual({ completedChunks: 2, totalChunks: 2 });
  });
});
