import { describe, expect, it } from 'vitest';
import { chunkParagraphs, normalizeParagraphs } from '../../src/core/chunking.js';

describe('paragraph chunking', () => {
  it('normalizes whitespace without changing paragraph order', () => {
    expect(normalizeParagraphs('  First   line\n\n  Second line  ')).toEqual([
      'First line',
      'Second line',
    ]);
  });

  it('splits an oversized paragraph at sentence boundaries', () => {
    const firstSentence = `${'A'.repeat(129)}.`;
    const secondSentence = `${'B'.repeat(129)}.`;
    expect(chunkParagraphs([`${firstSentence} ${secondSentence}`], 256).map((chunk) => chunk.source)).toEqual([
      firstSentence,
      secondSentence,
    ]);
  });

  it('rejects a chunk size too small to safely send to the API', () => {
    expect(() => chunkParagraphs(['text'], 255)).toThrow('at least 256');
  });
});
