export interface SourcePage {
  pageNumber: number;
  text: string;
}

export interface PDFWorkerTextResult {
  text: string;
  pageChars?: number[];
}

export function splitTextByPageChars(result: PDFWorkerTextResult): SourcePage[] {
  const pageChars = result.pageChars;
  if (!isValidPageChars(pageChars, result.text.length)) {
    return [{ pageNumber: 1, text: normalizeLineEndings(result.text) }];
  }

  let offset = 0;
  return pageChars.map((characterCount, index) => {
    const isLastPage = index === pageChars.length - 1;
    const end = isLastPage ? result.text.length : offset + characterCount;
    const text = normalizeLineEndings(result.text.slice(offset, end));
    offset += characterCount;
    return { pageNumber: index + 1, text };
  });
}

function isValidPageChars(pageChars: number[] | undefined, textLength: number): pageChars is number[] {
  if (!pageChars?.length) return false;
  if (!pageChars.every(value => Number.isInteger(value) && value >= 0)) return false;
  return pageChars.reduce((total, value) => total + value, 0) <= textLength;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}
