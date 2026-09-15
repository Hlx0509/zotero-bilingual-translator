import type { StructuredDocumentText, StructuredNode } from './sdt-pack.js';

export interface LayoutDocument { pages: LayoutPage[]; warnings: LayoutWarning[] }
export interface LayoutPage { pageNumber: number; blocks: LayoutBlock[] }
export type LayoutBlock = LayoutTextBlock | LayoutVisualBlock;
export interface LayoutTextBlock {
  id: string;
  type: 'text';
  role: 'heading' | 'paragraph' | 'list' | 'caption' | 'note';
  sourceText: string;
}
export interface LayoutVisualBlock {
  id: string;
  type: 'visual';
  role: 'image' | 'display-math' | 'table';
  pageNumber: number;
  rect: [number, number, number, number];
}
export interface LayoutWarning { code: 'INVALID_RECT' | 'MISSING_PAGE'; blockId: string }

const TEXT_ROLES: Record<string, LayoutTextBlock['role']> = {
  heading: 'heading',
  paragraph: 'paragraph',
  list: 'list',
  caption: 'caption',
  note: 'note',
  preformatted: 'note',
};

const VISUAL_ROLES: Record<string, LayoutVisualBlock['role']> = {
  image: 'image',
  math: 'display-math',
  table: 'table',
};

export function buildLayoutDocument(sdt: StructuredDocumentText): LayoutDocument {
  const catalogPages = Array.isArray(sdt.catalog.pages) ? sdt.catalog.pages : [];
  if (!catalogPages.length) throw new Error('Structured document has no pages');
  const pages: LayoutPage[] = catalogPages.map((_, index) => ({ pageNumber: index + 1, blocks: [] }));
  const warnings: LayoutWarning[] = [];

  sdt.content.forEach((node, topLevelIndex) => {
    appendNode(node, String(topLevelIndex), topLevelIndex, undefined, sdt, pages, warnings);
  });
  return { pages, warnings };
}

function appendNode(
  node: StructuredNode,
  id: string,
  topLevelIndex: number,
  inheritedPageIndex: number | undefined,
  sdt: StructuredDocumentText,
  pages: LayoutPage[],
  warnings: LayoutWarning[],
): void {
  if (node.flowClass === 'excluded') return;
  const type = node.type ?? '';
  const anchorPageIndex = firstAnchorPageIndex(node);
  const pageIndex = anchorPageIndex ?? inheritedPageIndex ?? pageIndexFromCatalog(topLevelIndex, sdt);

  const textRole = TEXT_ROLES[type];
  if (textRole) {
    const sourceText = extractNodeText(node).trim();
    if (sourceText && pageIndex !== undefined && pages[pageIndex]) {
      pages[pageIndex].blocks.push({ id, type: 'text', role: textRole, sourceText });
    }
    return;
  }

  const visualRole = VISUAL_ROLES[type];
  if (visualRole) {
    const rects = Array.isArray(node.anchor?.pageRects) ? node.anchor.pageRects : [];
    rects.forEach((value, rectIndex) => {
      const blockId = `${id}:${rectIndex}`;
      if (!isPageRect(value)) {
        warnings.push({ code: 'INVALID_RECT', blockId });
        return;
      }
      const [sourcePageIndex, x1, y1, x2, y2] = value;
      if (!pages[sourcePageIndex]) {
        warnings.push({ code: 'MISSING_PAGE', blockId });
        return;
      }
      if (x2 <= x1 || y2 <= y1) {
        warnings.push({ code: 'INVALID_RECT', blockId });
        return;
      }
      pages[sourcePageIndex].blocks.push({
        id: blockId,
        type: 'visual',
        role: visualRole,
        pageNumber: sourcePageIndex + 1,
        rect: [x1, y1, x2, y2],
      });
    });
    return;
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child, childIndex) => {
      if (child && typeof child === 'object' && typeof child.text !== 'string') {
        appendNode(child, `${id}.${childIndex}`, topLevelIndex, pageIndex, sdt, pages, warnings);
      }
    });
  }
}

function extractNodeText(node: StructuredNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  const values = node.content.map(extractNodeText).filter(Boolean);
  const hasBlockChildren = node.content.some(child => child && typeof child === 'object' && typeof child.text !== 'string');
  return values.join(hasBlockChildren ? '\n' : '');
}

function firstAnchorPageIndex(node: StructuredNode): number | undefined {
  const rects = Array.isArray(node.anchor?.pageRects) ? node.anchor.pageRects : [];
  const first = rects[0];
  return Array.isArray(first) && Number.isInteger(first[0]) ? first[0] as number : undefined;
}

function pageIndexFromCatalog(topLevelIndex: number, sdt: StructuredDocumentText): number | undefined {
  const pages = Array.isArray(sdt.catalog.pages) ? sdt.catalog.pages : [];
  return pages.findIndex(page => {
    const range = page.contentRange;
    if (!Array.isArray(range) || range.length !== 2) return false;
    const start = Array.isArray(range[0]) ? range[0][0] : undefined;
    const end = Array.isArray(range[1]) ? range[1][0] : undefined;
    return Number.isInteger(start) && Number.isInteger(end) && topLevelIndex >= start! && topLevelIndex < end!;
  });
}

function isPageRect(value: unknown): value is [number, number, number, number, number] {
  return Array.isArray(value)
    && value.length === 5
    && value.every(Number.isFinite)
    && Number.isInteger(value[0])
    && value[0] >= 0;
}
