export interface SourcePage {
  pageNumber: number;
  text: string;
}

export interface PDFWorkerTextResult {
  text: string;
  pageChars?: number[];
  extractedPages?: number;
  totalPages?: number;
}

export function splitTextByPageChars(result: PDFWorkerTextResult): SourcePage[] {
  const pageChars = result.pageChars;
  if (isValidPageChars(pageChars, result.text.length)) {
    let offset = 0;
    return pageChars.map((characterCount, index) => {
      const isLastPage = index === pageChars.length - 1;
      const end = isLastPage ? result.text.length : offset + characterCount;
      const text = normalizeLineEndings(result.text.slice(offset, end));
      offset += characterCount;
      return { pageNumber: index + 1, text };
    });
  }

  if (result.text.includes('\f') || isPositiveInteger(result.totalPages) && result.totalPages > 1) {
    const pageTexts = result.text.split('\f').map(text => normalizeLineEndings(text).trim());
    const pageCount = Math.max(pageTexts.length, isPositiveInteger(result.totalPages) ? result.totalPages : 0);
    return Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: pageTexts[index] ?? '',
    }));
  }

  return [{ pageNumber: 1, text: normalizeLineEndings(result.text) }];
}

function isValidPageChars(pageChars: number[] | undefined, textLength: number): pageChars is number[] {
  if (!pageChars?.length) return false;
  if (!pageChars.every(value => Number.isInteger(value) && value >= 0)) return false;
  return pageChars.reduce((total, value) => total + value, 0) <= textLength;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function isPositiveInteger(value: number | undefined): value is number {
  return Number.isInteger(value) && (value ?? 0) > 0;
}
