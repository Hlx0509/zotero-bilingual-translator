import { describe, expect, it, vi } from 'vitest';
import { DeepSeekClient, TranslationError } from '../../src/core/deepseek.js';

const chunk = { id: '0', paragraphs: ['A', 'B'], source: 'A\n\nB' };

describe('DeepSeekClient', () => {
  it('returns one translation for every source paragraph', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ translations: ['甲', '乙'] }) } }],
    }), { status: 200 }));
    const client = new DeepSeekClient({ apiKey: 'secret', model: 'deepseek-chat', fetchImpl, sleep: async () => {} });

    await expect(client.translate(chunk, new AbortController().signal)).resolves.toEqual(['甲', '乙']);
  });

  it('rejects a response with a mismatched translation count', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ translations: ['甲'] }) } }],
    }), { status: 200 }));
    const client = new DeepSeekClient({ apiKey: 'secret', model: 'deepseek-chat', fetchImpl, sleep: async () => {} });

    await expect(client.translate(chunk, new AbortController().signal)).rejects.toMatchObject<Partial<TranslationError>>({
      code: 'INVALID_RESPONSE',
    });
  });

  it('retries a rate-limited request before returning its translation', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ translations: ['甲', '乙'] }) } }],
      }), { status: 200 }));
    const sleeps: number[] = [];
    const client = new DeepSeekClient({ apiKey: 'secret', model: 'deepseek-chat', fetchImpl, sleep: async (ms) => { sleeps.push(ms); } });

    await expect(client.translate(chunk, new AbortController().signal)).resolves.toEqual(['甲', '乙']);
    expect(sleeps).toEqual([500]);
  });
});
