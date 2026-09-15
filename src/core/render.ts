import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { TranslatedDocument } from './orchestrator.js';

export interface RenderInput extends TranslatedDocument {
  title: string;
  cjkFontBytes: Uint8Array;
}

export async function renderBilingualPdf(input: RenderInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const cjk = await pdf.embedFont(input.cjkFontBytes, { subset: true });
  let page = pdf.addPage([595.28, 841.89]);
  let y = 787;
  page.drawText(input.title, { x: 54, y, size: 18, font: cjk, color: rgb(0.1, 0.1, 0.1) });
  y -= 36;

  for (const chunk of input.chunks) {
    for (let index = 0; index < chunk.paragraphs.length; index += 1) {
      ({ page, y } = drawWrapped(page, y, chunk.paragraphs[index], cjk, rgb(0.12, 0.12, 0.12), 11));
      ({ page, y } = drawWrapped(page, y - 6, chunk.translations[index], cjk, rgb(0, 0.28, 0.52), 11));
      y -= 12;
      if (y < 75) {
        page = pdf.addPage([595.28, 841.89]);
        y = 787;
      }
    }
  }
  return pdf.save();
}

function drawWrapped(page: PDFPage, initialY: number, text: string, font: PDFFont, color: ReturnType<typeof rgb>, size: number): { page: PDFPage; y: number } {
  const maxWidth = 487;
  const lines: string[] = [];
  let line = '';
  for (const character of text) {
    const candidate = line + character;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = character;
    } else line = candidate;
  }
  if (line) lines.push(line);
  let y = initialY;
  for (const value of lines) {
    page.drawText(value, { x: 54, y, size, font, color });
    y -= 16;
  }
  return { page, y };
}
