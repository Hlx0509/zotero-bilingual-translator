import { describe, expect, it } from 'vitest';
import { deflateRaw } from 'pako';
import { decodeSDTPack } from '../../src/core/sdt-pack.js';

const encoder = new TextEncoder();

describe('decodeSDTPack', () => {
  it('materializes metadata, catalog, and ordered content blocks', () => {
    const bytes = buildPack({
      metadata: { processor: { type: 'pdf', version: 1 } },
      catalog: { pages: [{ contentRange: [[0], [2]] }] },
      content: [
        { type: 'paragraph', content: [{ text: 'Alpha' }] },
        { type: 'image', content: [], anchor: { pageRects: [[0, 10, 20, 30, 40]] } },
      ],
    });

    const decoded = decodeSDTPack(bytes);

    expect(decoded.schemaVersion).toBe('1.2.0');
    expect(decoded.metadata).toEqual({ processor: { type: 'pdf', version: 1 } });
    expect(decoded.catalog.pages).toHaveLength(1);
    expect(decoded.content.map(block => block.type)).toEqual(['paragraph', 'image']);
  });

  it('rejects invalid pack magic and unsupported versions', () => {
    const bytes = buildPack({ metadata: {}, catalog: { pages: [] }, content: [] });
    const invalidMagic = bytes.slice();
    invalidMagic[0] = 0;
    const invalidVersion = bytes.slice();
    invalidVersion[8] = 2;

    expect(() => decodeSDTPack(invalidMagic)).toThrow('magic');
    expect(() => decodeSDTPack(invalidVersion)).toThrow('version');
  });
});

function buildPack(input: { metadata: object; catalog: object; content: object[] }): Uint8Array {
  const metadata = deflateRaw(encoder.encode(JSON.stringify(input.metadata)));
  const catalog = deflateRaw(encoder.encode(JSON.stringify(input.catalog)));
  const blockBytes = input.content.map(block => encoder.encode(JSON.stringify(block)));
  const chunkHeaderLength = blockBytes.length * 4;
  const chunk = new Uint8Array(chunkHeaderLength + blockBytes.reduce((sum, block) => sum + block.length, 0));
  let blockOffset = 0;
  for (let index = 0; index < blockBytes.length; index += 1) {
    writeU32(chunk, index * 4, blockOffset);
    chunk.set(blockBytes[index], chunkHeaderLength + blockOffset);
    blockOffset += blockBytes[index].length;
  }
  const compressedChunk = deflateRaw(chunk);
  const index = new Uint8Array(24);
  writeU32(index, 0, metadata.length);
  writeU32(index, 4, catalog.length);
  writeU32(index, 8, 0);
  writeU32(index, 12, compressedChunk.length);
  writeU32(index, 16, 0);
  writeU32(index, 20, input.content.length);

  const header = new Uint8Array(16);
  header.set([0x89, 0x53, 0x44, 0x54, 0x0d, 0x0a, 0x1a, 0x0a, 1, 1, 2, 0]);
  writeU32(header, 12, index.length);
  return concat(header, index, metadata, catalog, compressedChunk);
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
