export interface StructuredPageInfo {
  contentRange?: number[][];
  viewRect?: [number, number, number, number];
  [key: string]: unknown;
}

export interface StructuredNode {
  type?: string;
  text?: string;
  content?: StructuredNode[];
  anchor?: { pageRects?: unknown };
  flowClass?: string;
  [key: string]: unknown;
}

export interface StructuredDocumentText {
  schemaVersion: string;
  metadata: Record<string, unknown>;
  catalog: { pages?: StructuredPageInfo[]; [key: string]: unknown };
  content: StructuredNode[];
}

const MAGIC = [0x89, 0x53, 0x44, 0x54, 0x0d, 0x0a, 0x1a, 0x0a];
const HEADER_SIZE = 16;
const decoder = new TextDecoder();

export function decodeSDTPack(bytes: Uint8Array): StructuredDocumentText {
  if (bytes.length < HEADER_SIZE) throw new Error('Invalid SDT pack: file too small');
  if (!MAGIC.every((value, index) => bytes[index] === value)) throw new Error('Invalid SDT pack magic');
  if (bytes[8] !== 1) throw new Error(`Unsupported SDT pack version: ${bytes[8]}`);

  const indexLength = readU32(bytes, 12);
  if (indexLength < 16 || (indexLength - 8) % 8 !== 0 || HEADER_SIZE + indexLength > bytes.length) {
    throw new Error('Invalid SDT pack index');
  }
  const index = bytes.subarray(HEADER_SIZE, HEADER_SIZE + indexLength);
  const metadataLength = readU32(index, 0);
  const catalogLength = readU32(index, 4);
  const entryCount = (indexLength - 8) / 8;
  const chunkOffsets = readU32Array(index, 8, entryCount);
  const blockStarts = readU32Array(index, 8 + entryCount * 4, entryCount);
  validateIndex(chunkOffsets, blockStarts);

  const metadataStart = HEADER_SIZE + indexLength;
  const catalogStart = metadataStart + metadataLength;
  const contentStart = catalogStart + catalogLength;
  const contentLength = chunkOffsets.at(-1) ?? 0;
  if (contentStart + contentLength !== bytes.length) throw new Error('Invalid SDT pack bounds');

  const metadata = parseCompressedJson(bytes.subarray(metadataStart, catalogStart)) as Record<string, unknown>;
  const catalog = parseCompressedJson(bytes.subarray(catalogStart, contentStart)) as StructuredDocumentText['catalog'];
  const content: StructuredNode[] = [];
  for (let chunkIndex = 0; chunkIndex < entryCount - 1; chunkIndex += 1) {
    const compressed = bytes.subarray(
      contentStart + chunkOffsets[chunkIndex],
      contentStart + chunkOffsets[chunkIndex + 1],
    );
    const chunk = inflateRaw(compressed);
    const blockCount = blockStarts[chunkIndex + 1] - blockStarts[chunkIndex];
    const headerLength = blockCount * 4;
    if (chunk.length < headerLength) throw new Error('Invalid SDT content chunk');
    const localOffsets = readU32Array(chunk, 0, blockCount);
    for (let localIndex = 0; localIndex < blockCount; localIndex += 1) {
      const start = headerLength + localOffsets[localIndex];
      const end = localIndex + 1 < blockCount
        ? headerLength + localOffsets[localIndex + 1]
        : chunk.length;
      if (start > end || end > chunk.length) throw new Error('Invalid SDT block bounds');
      content.push(JSON.parse(decoder.decode(chunk.subarray(start, end))) as StructuredNode);
    }
  }

  return {
    schemaVersion: `${bytes[9]}.${bytes[10]}.${bytes[11]}`,
    metadata,
    catalog,
    content,
  };
}

function parseCompressedJson(bytes: Uint8Array): unknown {
  return JSON.parse(decoder.decode(inflateRaw(bytes)));
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('Invalid SDT pack bounds');
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readU32Array(bytes: Uint8Array, offset: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => readU32(bytes, offset + index * 4));
}

function validateIndex(chunkOffsets: number[], blockStarts: number[]): void {
  if (chunkOffsets.length !== blockStarts.length || !chunkOffsets.length) throw new Error('Invalid SDT index shape');
  if (chunkOffsets[0] !== 0 || blockStarts[0] !== 0) throw new Error('Invalid SDT index origin');
  for (let index = 1; index < chunkOffsets.length; index += 1) {
    if (chunkOffsets[index] < chunkOffsets[index - 1] || blockStarts[index] < blockStarts[index - 1]) {
      throw new Error('Invalid SDT index order');
    }
  }
}
import { inflateRaw } from 'pako';
