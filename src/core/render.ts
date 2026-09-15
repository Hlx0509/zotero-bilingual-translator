import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { TranslatedPage } from './page-translation.js';
import type { TranslatedLayoutDocument } from './layout-translation.js';
import type { LayoutWarning } from './layout.js';
import { choosePageBreak, fitVisualBlock } from './visual-layout.js';

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

export interface StructuredRenderInput extends TranslatedLayoutDocument {
  title: string;
  sourcePdfBytes: Uint8Array;
  cjkFontBytes: Uint8Array;
}

export interface RenderResult {
  bytes: Uint8Array;
  warnings: LayoutWarning[];
}

export async function renderStructuredBilingualPdf(input: StructuredRenderInput): Promise<RenderResult> {
  const source = await PDFDocument.load(input.sourcePdfBytes);
  const output = await PDFDocument.create();
  output.registerFontkit(fontkit);
  const cjk = await output.embedFont(input.cjkFontBytes, { subset: true });
  const warnings = [...input.warnings];
  const layoutsByPage = new Map(input.pages.map(page => [page.pageNumber, page]));

  for (let sourceIndex = 0; sourceIndex < source.getPageCount(); sourceIndex += 1) {
    const [copiedPage] = await output.copyPages(source, [sourceIndex]);
    output.addPage(copiedPage);
    const layoutPage = layoutsByPage.get(sourceIndex + 1);
    if (!layoutPage?.blocks.length) continue;

    let continuation = 1;
    let page = addTranslationPage(output, cjk, input.title, sourceIndex + 1, continuation);
    let y = 752;
    const newPage = () => {
      continuation += 1;
      page = addTranslationPage(output, cjk, input.title, sourceIndex + 1, continuation);
      y = 752;
    };

    for (let blockIndex = 0; blockIndex < layoutPage.blocks.length; blockIndex += 1) {
      const block = layoutPage.blocks[blockIndex];
      if (block.type === 'text') {
        const style = textStyle(block.role);
        for (const translation of block.translations) {
          for (const line of wrapText(translation, cjk, style.size, A4[0] - MARGIN * 2)) {
            if (y < BOTTOM_MARGIN + style.lineHeight) newPage();
            page.drawText(line, { x: MARGIN, y, size: style.size, font: cjk, color: style.color });
            y -= style.lineHeight;
          }
          y -= style.spacing;
        }
        continue;
      }

      const sourcePage = source.getPage(block.pageNumber - 1);
      if (!sourcePage) {
        warnings.push({ code: 'MISSING_PAGE', blockId: block.id });
        continue;
      }
      const [x1, y1, x2, y2] = block.rect;
      const crop = sourcePage.getCropBox();
      const bounds = {
        left: Math.max(crop.x, x1),
        bottom: Math.max(crop.y, y1),
        right: Math.min(crop.x + crop.width, x2),
        top: Math.min(crop.y + crop.height, y2),
      };
      if (bounds.right <= bounds.left || bounds.top <= bounds.bottom) {
        warnings.push({ code: 'INVALID_RECT', blockId: block.id });
        continue;
      }

      const next = layoutPage.blocks[blockIndex + 1];
      const captionHeight = next?.type === 'text' && next.role === 'caption'
        ? estimateTextBlockHeight(next.translations, cjk, 9, 13, 6)
        : 0;
      const fitted = fitVisualBlock(
        { width: bounds.right - bounds.left, height: bounds.top - bounds.bottom },
        { maxWidth: A4[0] - MARGIN * 2, maxHeight: 688 - captionHeight },
      );
      if (choosePageBreak({ remaining: y - BOTTOM_MARGIN, visualHeight: fitted.height, captionHeight })) newPage();
      try {
        const embedded = await output.embedPage(sourcePage, bounds);
        page.drawPage(embedded, {
          x: MARGIN + (A4[0] - MARGIN * 2 - fitted.width) / 2,
          y: y - fitted.height,
          width: fitted.width,
          height: fitted.height,
        });
        y -= fitted.height + 12;
      } catch {
        warnings.push({ code: 'CROP_FAILED', blockId: block.id });
      }
    }
  }

  return { bytes: await output.save(), warnings };
}

function textStyle(role: 'heading' | 'paragraph' | 'list' | 'caption' | 'note') {
  if (role === 'heading') return { size: 14, lineHeight: 20, spacing: 10, color: rgb(0, 0.22, 0.4) };
  if (role === 'caption') return { size: 9, lineHeight: 13, spacing: 10, color: rgb(0.28, 0.28, 0.28) };
  if (role === 'note') return { size: 9, lineHeight: 13, spacing: 8, color: rgb(0.3, 0.3, 0.3) };
  return { size: BODY_SIZE, lineHeight: LINE_HEIGHT, spacing: 10, color: rgb(0.08, 0.18, 0.28) };
}

function estimateTextBlockHeight(
  translations: string[],
  font: PDFFont,
  size: number,
  lineHeight: number,
  spacing: number,
): number {
  return translations.reduce(
    (height, text) => height + wrapText(text, font, size, A4[0] - MARGIN * 2).length * lineHeight + spacing,
    0,
  );
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
