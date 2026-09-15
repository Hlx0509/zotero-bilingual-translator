import { describe, expect, it } from 'vitest';
import { buildLayoutDocument } from '../../src/core/layout.js';
import type { StructuredDocumentText } from '../../src/core/sdt-pack.js';

describe('buildLayoutDocument', () => {
  it('preserves semantic order for text, images, captions, math, and tables', () => {
    const layout = buildLayoutDocument(documentWith([
      textNode('paragraph', 'Body', [0, 40, 700, 520, 740]),
      visualNode('image', [[0, 40, 400, 520, 680]]),
      textNode('caption', 'Figure 1', [0, 40, 370, 520, 395]),
      visualNode('math', [[0, 120, 300, 460, 350]]),
      visualNode('table', [[0, 40, 100, 520, 280]]),
    ], 1));

    expect(layout.pages[0].blocks.map(block => block.role)).toEqual([
      'paragraph', 'image', 'caption', 'display-math', 'table',
    ]);
    expect(layout.pages[0].blocks[4]).toMatchObject({
      type: 'visual', pageNumber: 1, rect: [40, 100, 520, 280],
    });
  });

  it('flattens lists as text and uses page content ranges when anchors are absent', () => {
    const layout = buildLayoutDocument(documentWith([{
      type: 'list',
      content: [
        { type: 'listitem', content: [{ text: 'First' }] },
        { type: 'listitem', content: [{ text: 'Second' }] },
      ],
    }], 1));

    expect(layout.pages[0].blocks).toEqual([{
      id: '0', type: 'text', role: 'list', sourceText: 'First\nSecond',
    }]);
  });

  it('splits multi-page visuals and warns instead of emitting invalid rectangles', () => {
    const layout = buildLayoutDocument(documentWith([
      visualNode('image', [[0, 10, 20, 100, 120], [1, 15, 25, 110, 130]]),
      visualNode('math', [[0, 50, 50, 40, 80]]),
      visualNode('table', [[4, 10, 10, 20, 20]]),
    ], 2));

    expect(layout.pages[0].blocks[0]).toMatchObject({ id: '0:0', role: 'image', pageNumber: 1 });
    expect(layout.pages[1].blocks[0]).toMatchObject({ id: '0:1', role: 'image', pageNumber: 2 });
    expect(layout.warnings).toEqual([
      { code: 'INVALID_RECT', blockId: '1:0' },
      { code: 'MISSING_PAGE', blockId: '2:0' },
    ]);
  });
});

function documentWith(content: StructuredDocumentText['content'], pageCount: number): StructuredDocumentText {
  return {
    schemaVersion: '1.2.0',
    metadata: {},
    catalog: {
      pages: Array.from({ length: pageCount }, (_, index) => ({
        contentRange: [[index === 0 ? 0 : content.length], [content.length]],
        viewRect: [0, 0, 595, 842],
      })),
    },
    content,
  };
}

function textNode(type: string, text: string, rect: [number, number, number, number, number]) {
  return { type, content: [{ text }], anchor: { pageRects: [rect] } };
}

function visualNode(type: string, pageRects: number[][]) {
  return { type, content: [], anchor: { pageRects } };
}
