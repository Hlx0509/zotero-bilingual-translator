import type { TranslationChunk } from './types.js';

export function normalizeParagraphs(raw: string): string[] {
  return raw
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

export function chunkParagraphs(paragraphs: string[], maxChars: number): TranslationChunk[] {
  if (maxChars < 256) {
    throw new Error('maxChunkCharacters must be at least 256');
  }

  const sources = paragraphs.flatMap((paragraph) => splitOversizedParagraph(paragraph, maxChars));
  return sources.map((source, index) => ({ id: String(index), paragraphs: [source], source }));
}

function splitOversizedParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];

  const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]?/gu)?.map((value) => value.trim()).filter(Boolean) ?? [paragraph];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) chunks.push(current);
      for (let start = 0; start < sentence.length; start += maxChars) {
        chunks.push(sentence.slice(start, start + maxChars));
      }
      current = '';
    } else if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxChars) {
      current += ` ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
