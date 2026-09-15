import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderBilingualPdf } from '../../src/core/render.js';

describe('renderBilingualPdf', () => {
  it('creates a nonempty PDF for bilingual paragraph pairs', async () => {
    const bytes = await renderBilingualPdf({
      title: 'Paper',
      chunks: [{ id: '0', paragraphs: ['English source'], source: 'English source', translations: ['中文译文'] }],
      cjkFontBytes: await readFile('C:/Windows/Fonts/NotoSansSC-VF.ttf'),
    });
    expect([...bytes.subarray(0, 4)]).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('renders Unicode characters in the source paragraph', async () => {
    await expect(renderBilingualPdf({
      title: '含 Unicode 的文献',
      chunks: [{ id: '0', paragraphs: ['“Quoted” text and 中文'], source: '“Quoted” text and 中文', translations: ['译文'] }],
      cjkFontBytes: await readFile('C:/Windows/Fonts/NotoSansSC-VF.ttf'),
    })).resolves.toBeInstanceOf(Uint8Array);
  });
});
