import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFDict, PDFDocument, PDFName, rgb } from 'pdf-lib';
import { renderBilingualPdf, renderStructuredBilingualPdf } from '../../src/core/render.js';

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

describe('renderStructuredBilingualPdf', () => {
  it('copies the source page and embeds a clipped visual into its companion page', async () => {
    const source = await PDFDocument.create();
    const sourcePage = source.addPage([300, 400]);
    sourcePage.drawRectangle({ x: 40, y: 100, width: 180, height: 120, color: rgb(1, 0, 0) });

    const result = await renderStructuredBilingualPdf({
      title: 'Paper',
      sourcePdfBytes: await source.save(),
      cjkFontBytes: await readFile('C:/Windows/Fonts/NotoSansSC-VF.ttf'),
      warnings: [],
      pages: [{ pageNumber: 1, blocks: [
        { id: 'p1', type: 'text', role: 'paragraph', sourceText: 'Body', translations: ['正文译文'] },
        { id: 'img1', type: 'visual', role: 'image', pageNumber: 1, rect: [40, 100, 220, 220] },
        { id: 'cap1', type: 'text', role: 'caption', sourceText: 'Figure', translations: ['图一'] },
      ] }],
    });

    const output = await PDFDocument.load(result.bytes);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
    const resources = output.getPage(1).node.Resources();
    const xObjects = resources?.lookup(PDFName.of('XObject'), PDFDict);
    expect(xObjects?.keys().length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it('does not create a companion page for a structurally blank source page', async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    const result = await renderStructuredBilingualPdf({
      title: 'Blank',
      sourcePdfBytes: await source.save(),
      cjkFontBytes: await readFile('C:/Windows/Fonts/NotoSansSC-VF.ttf'),
      warnings: [],
      pages: [{ pageNumber: 1, blocks: [] }],
    });

    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
  });
});
