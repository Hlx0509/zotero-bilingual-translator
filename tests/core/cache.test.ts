import { describe, expect, it } from 'vitest';
import { cacheKey } from '../../src/core/cache.js';

describe('translation cache keys', () => {
  it('changes when the source document changes', async () => {
    const base = { source: 'One.', model: 'deepseek-chat', targetLanguage: 'zh-CN' };
    await expect(cacheKey({ ...base, documentFingerprint: 'pdf-1' }))
      .resolves.not.toBe(await cacheKey({ ...base, documentFingerprint: 'pdf-2' }));
  });

  it('is stable for the same translation input', async () => {
    const input = { documentFingerprint: 'pdf-1', source: 'One.', model: 'deepseek-chat', targetLanguage: 'zh-CN' };
    await expect(cacheKey(input)).resolves.toBe(await cacheKey(input));
  });
});
