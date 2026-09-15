import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { renderBilingualPdf } from '../../src/core/render.js';

async function createSourcePdf(): Promise<Uint8Array> {
  const source = await PDFDocument.create();
  source.addPage([300, 400]);
  source.addPage([500, 600]);
  return source.save();
}

describe('renderBilingualPdf', () => {
  it('copies each source page before its Unicode translation page', async () => {
    const bytes = await renderBilingualPdf({
      title: '含 Unicode 的文献',
      sourcePdfBytes: await createSourcePdf(),
      pages: [
        { pageNumber: 1, sourceText: 'First', translations: ['第一页中文译文'] },
        { pageNumber: 2, sourceText: 'Second', translations: ['第二页中文译文'] },
      ],
      cjkFontBytes: await readFile('C:/Windows/Fonts/NotoSansSC-VF.ttf'),
    });

    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(4);
    expect(output.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
    expect(output.getPage(1).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(output.getPage(2).getSize()).toEqual({ width: 500, height: 600 });
  });

  it('does not add an empty translation page', async () => {
    const bytes = await renderBilingualPdf({
      title: 'Paper',
      sourcePdfBytes: await createSourcePdf(),
      pages: [
        { pageNumber: 1, sourceText: '', translations: [] },
        { pageNumber: 2, sourceText: 'Second', translations: ['译文'] },
      ],
      cjkFontBytes: await readFile('C:/Windows/Fonts/NotoSansSC-VF.ttf'),
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });

  it('continues a long translation onto additional pages', async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    const bytes = await renderBilingualPdf({
      title: 'Paper',
      sourcePdfBytes: await source.save(),
      pages: [{ pageNumber: 1, sourceText: 'Long', translations: ['中文'.repeat(5000)] }],
      cjkFontBytes: await readFile('C:/Windows/Fonts/NotoSansSC-VF.ttf'),
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
});
