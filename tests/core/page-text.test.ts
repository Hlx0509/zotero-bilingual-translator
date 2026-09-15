import { describe, expect, it } from 'vitest';
import { splitTextByPageChars } from '../../src/core/page-text.js';

describe('splitTextByPageChars', () => {
  it('keeps page boundaries and empty pages from PDF Worker metadata', () => {
    expect(splitTextByPageChars({ text: 'Page 1Page 3', pageChars: [6, 0, 6] })).toEqual([
      { pageNumber: 1, text: 'Page 1' },
      { pageNumber: 2, text: '' },
      { pageNumber: 3, text: 'Page 3' },
    ]);
  });

  it('normalizes line endings without changing page assignment', () => {
    expect(splitTextByPageChars({ text: 'A\r\nB\rC', pageChars: [4, 2] })).toEqual([
      { pageNumber: 1, text: 'A\nB' },
      { pageNumber: 2, text: '\nC' },
    ]);
  });

  it('attaches unaccounted trailing text to the final page', () => {
    expect(splitTextByPageChars({ text: 'FirstSecond', pageChars: [5, 3] })).toEqual([
      { pageNumber: 1, text: 'First' },
      { pageNumber: 2, text: 'Second' },
    ]);
  });

  it('falls back to one page when page metadata is malformed', () => {
    expect(splitTextByPageChars({ text: 'Whole document', pageChars: [5, -1] })).toEqual([
      { pageNumber: 1, text: 'Whole document' },
    ]);
  });
});
