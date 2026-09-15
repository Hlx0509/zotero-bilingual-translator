import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { TranslatedPage } from './page-translation.js';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 54;
const BODY_SIZE = 11;
const LINE_HEIGHT = 17;
const BOTTOM_MARGIN = 64;

export interface RenderInput {
  title: string;
  sourcePdfBytes: Uint8Array;
  pages: TranslatedPage[];
  cjkFontBytes: Uint8Array;
}

export async function renderBilingualPdf(input: RenderInput): Promise<Uint8Array> {
  const source = await PDFDocument.load(input.sourcePdfBytes);
  const output = await PDFDocument.create();
  output.registerFontkit(fontkit);
  const cjk = await output.embedFont(input.cjkFontBytes, { subset: true });
  const translationsByPage = new Map(input.pages.map(page => [page.pageNumber, page]));

  for (let index = 0; index < source.getPageCount(); index += 1) {
    const [copiedPage] = await output.copyPages(source, [index]);
    output.addPage(copiedPage);

    const translatedPage = translationsByPage.get(index + 1);
    const paragraphs = translatedPage?.translations.map(text => text.trim()).filter(Boolean) ?? [];
    if (paragraphs.length) {
      drawTranslationPages(output, cjk, input.title, index + 1, paragraphs);
    }
  }

  return output.save();
}

function drawTranslationPages(
  document: PDFDocument,
  font: PDFFont,
  title: string,
  sourcePageNumber: number,
  paragraphs: string[],
): void {
  let translationPageNumber = 1;
  let page = addTranslationPage(document, font, title, sourcePageNumber, translationPageNumber);
  let y = 752;

  for (const paragraph of paragraphs) {
    for (const line of wrapText(paragraph, font, BODY_SIZE, A4[0] - MARGIN * 2)) {
      if (y < BOTTOM_MARGIN) {
        translationPageNumber += 1;
        page = addTranslationPage(document, font, title, sourcePageNumber, translationPageNumber);
        y = 752;
      }
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font, color: rgb(0.08, 0.18, 0.28) });
      y -= LINE_HEIGHT;
    }
    y -= 10;
  }
}

function addTranslationPage(
  document: PDFDocument,
  font: PDFFont,
  title: string,
  sourcePageNumber: number,
  translationPageNumber: number,
): PDFPage {
  const page = document.addPage(A4);
  const continuation = translationPageNumber > 1 ? `（续 ${translationPageNumber}）` : '';
  page.drawText(`原文第 ${sourcePageNumber} 页译文${continuation}`, {
    x: MARGIN,
    y: 792,
    size: 16,
    font,
    color: rgb(0, 0.28, 0.52),
  });
  const displayTitle = truncateToWidth(title, font, 10, A4[0] - MARGIN * 2);
  page.drawText(displayTitle, { x: MARGIN, y: 772, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
  return page;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const logicalLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!logicalLine) {
      lines.push(' ');
      continue;
    }
    let line = '';
    for (const character of logicalLine) {
      const candidate = line + character;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = '';
  for (const character of text) {
    if (font.widthOfTextAtSize(`${truncated}${character}…`, size) > maxWidth) break;
    truncated += character;
  }
  return `${truncated}…`;
}
