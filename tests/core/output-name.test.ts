import { describe, expect, it } from 'vitest';
import { assertTranslatableAttachment, uniqueOutputPath } from '../../src/zotero/adapter.js';

describe('attachment helpers', () => {
  it('uses a sibling bilingual filename when no file conflicts', async () => {
    await expect(uniqueOutputPath('C:/papers/article.pdf', async () => false))
      .resolves.toBe('C:/papers/article.bilingual-zh-CN.pdf');
  });

  it('adds a numeric suffix without overwriting an existing translation', async () => {
    await expect(uniqueOutputPath('C:/papers/article.pdf', async (path) => path.endsWith('bilingual-zh-CN.pdf')))
      .resolves.toBe('C:/papers/article.bilingual-zh-CN-2.pdf');
  });

  it('rejects a non-PDF attachment before any translation work begins', () => {
    expect(() => assertTranslatableAttachment({ contentType: 'text/plain', path: 'C:/notes/a.txt' }))
      .toThrow('PDF');
  });
});
