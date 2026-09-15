# Visual Blocks in Translation Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert source images, display formulas, and whole tables into readability-first Chinese companion pages at their semantic positions.

**Architecture:** Decode Zotero's packed Structured Document Text into a plugin-owned ordered layout model, translate only text blocks, and embed clipped source-page regions for visual blocks with `pdf-lib`. Keep the current page-delimited text pipeline as an explicit fallback when structured extraction or decoding is unavailable.

**Tech Stack:** TypeScript, Zotero 10 PDF Worker, Zotero Structured Document Text pack v1, pako raw-DEFLATE, DeepSeek chat completions, pdf-lib, @pdf-lib/fontkit, Vitest, esbuild.

**Spec:** `docs/superpowers/specs/2026-09-15-visual-blocks-in-translation-pages-design.md`

## Global Constraints

- Output order remains original page followed by its companion page or pages.
- Use readability-first single-column reflow; do not replace text in place.
- Preserve images and display formulas as source visual content.
- Preserve tables as whole visual blocks; do not translate table cells.
- Translate captions as text.
- Send text only to DeepSeek; never send source PDF bytes or visual crops.
- Inline formulas are best-effort and are not guaranteed.
- Fall back to the existing text-only companion pages when SDT extraction or decoding fails.
- Ship as version `0.3.0` and retain Zotero compatibility `7.9.9` through `10.9.9`.

---

### Task 1: Decode Zotero SDT pack v1

**Files:**
- Create: `src/core/sdt-pack.ts`
- Create: `tests/core/sdt-pack.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `{ buf: ArrayBuffer }` returned by `Zotero.PDFWorker.getStructuredDocumentText()`.
- Produces: `decodeSDTPack(bytes: Uint8Array): StructuredDocumentText`.

- [ ] **Step 1: Add raw-DEFLATE support**

Run: `npm install --save-dev pako @types/pako`

- [ ] **Step 2: Write the failing decoder tests**

Use a test-local pack builder that writes the documented `\x89SDT\r\n\x1a\n` header, version byte `1`, compressed metadata/catalog, and one compressed content chunk. Assert materialized values and reject invalid magic/version/bounds.

```ts
const decoded = decodeSDTPack(buildPack({
  schemaVersion: [1, 2, 0],
  metadata: { processor: { type: 'pdf', version: 1 } },
  catalog: { pages: [{ contentRange: [[0], [1]] }] },
  content: [{ type: 'paragraph', content: [{ text: 'Alpha' }] }],
}));
expect(decoded.schemaVersion).toBe('1.2.0');
expect(decoded.content[0].type).toBe('paragraph');
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm test -- tests/core/sdt-pack.test.ts`

Expected: FAIL because `decodeSDTPack` is missing or returns no materialized blocks.

- [ ] **Step 4: Implement the minimal decoder**

Define these public boundary types and decode all indexed chunks with `inflateRaw`:

```ts
export interface StructuredDocumentText {
  schemaVersion: string;
  metadata: Record<string, unknown>;
  catalog: { pages?: StructuredPageInfo[]; [key: string]: unknown };
  content: StructuredNode[];
}

export interface StructuredNode {
  type?: string;
  text?: string;
  content?: StructuredNode[];
  anchor?: { pageRects?: unknown };
  flowClass?: string;
  [key: string]: unknown;
}

export function decodeSDTPack(bytes: Uint8Array): StructuredDocumentText;
```

Validate magic, pack version `1`, schema bytes, index length, strictly increasing chunk offsets/block starts, and every slice bound before parsing JSON. Decode each content chunk's four-byte local block offset table.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- tests/core/sdt-pack.test.ts && npm run typecheck`

```bash
git add package.json package-lock.json src/core/sdt-pack.ts tests/core/sdt-pack.test.ts
git commit -m "feat: decode Zotero structured document packs"
```

### Task 2: Convert SDT into ordered layout blocks

**Files:**
- Create: `src/core/layout.ts`
- Create: `tests/core/layout.test.ts`

**Interfaces:**
- Consumes: `StructuredDocumentText` from Task 1.
- Produces: `buildLayoutDocument(sdt: StructuredDocumentText): LayoutDocument`.

- [ ] **Step 1: Write the failing layout tests**

Use literal SDT fixtures containing a paragraph, image, caption, math, table, list, invalid rectangle, and a block with rectangles on two pages. Assert exact ordered block arrays, text flattening, multi-page visual splitting, and warnings.

```ts
expect(layout.pages[0].blocks.map(block => block.role)).toEqual([
  'paragraph', 'image', 'caption', 'display-math', 'table',
]);
expect(layout.pages[0].blocks.find(block => block.role === 'table')).toMatchObject({
  type: 'visual', rect: [40, 100, 520, 300],
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/core/layout.test.ts`

- [ ] **Step 3: Implement the plugin-owned model and adapter**

```ts
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
```

Walk top-level SDT content in order. Map paragraph/heading/caption/note/preformatted to text; flatten lists and blockquotes recursively; map image/math/table to visual without traversing table cells. Skip `flowClass: 'excluded'`. Prefer anchor `pageRects`; otherwise map the top-level index through catalog page `contentRange`. Split multiple visual page rectangles into multiple blocks with stable suffixes.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/core/layout.test.ts && npm run typecheck`

```bash
git add src/core/layout.ts tests/core/layout.test.ts
git commit -m "feat: build ordered PDF layout blocks"
```

### Task 3: Translate only layout text blocks

**Files:**
- Create: `src/core/layout-translation.ts`
- Create: `tests/core/layout-translation.test.ts`
- Modify: `src/core/orchestrator.ts`

**Interfaces:**
- Consumes: `LayoutDocument`, existing `TranslationClient`, `TranslationCache`, and `TranslationSettings`.
- Produces: `translateLayout(request: TranslateLayoutRequest): Promise<TranslatedLayoutDocument>`.

- [ ] **Step 1: Write failing privacy and ordering tests**

Provide interleaved text and visual blocks. Assert the fake client receives only text, translated blocks retain IDs/order/roles, visuals pass through unchanged, and page/block progress is monotonic.

```ts
expect(clientSources).toEqual(['Heading', 'Body text', 'Figure caption']);
expect(result.pages[0].blocks.map(block => block.id)).toEqual(['h1', 'p1', 'img1', 'cap1']);
expect(result.pages[0].blocks[2]).toEqual(layout.pages[0].blocks[2]);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/core/layout-translation.test.ts`

- [ ] **Step 3: Implement ID-stable text translation**

```ts
export type TranslatedLayoutBlock =
  | (LayoutTextBlock & { translations: string[] })
  | LayoutVisualBlock;
export interface TranslatedLayoutDocument {
  pages: Array<{ pageNumber: number; blocks: TranslatedLayoutBlock[] }>;
  warnings: LayoutWarning[];
}
```

For every text block, call the existing paragraph chunker and `translateDocument()` with fingerprint `${documentFingerprint}:block:${block.id}`. Flatten returned translations on that same block. Do not call the translator for visual or empty text blocks.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- tests/core/layout-translation.test.ts && npm run typecheck`

```bash
git add src/core/layout-translation.ts src/core/orchestrator.ts tests/core/layout-translation.test.ts
git commit -m "feat: translate structured text blocks only"
```

### Task 4: Render reflowed visual companion pages

**Files:**
- Create: `src/core/visual-layout.ts`
- Create: `tests/core/visual-layout.test.ts`
- Modify: `src/core/render.ts`
- Modify: `tests/core/render.test.ts`

**Interfaces:**
- Consumes: `TranslatedLayoutDocument`, source PDF bytes, CJK font bytes, and title.
- Produces: `renderStructuredBilingualPdf(input: StructuredRenderInput): Promise<RenderResult>`.

- [ ] **Step 1: Test placement calculations RED**

Test `fitVisualBlock()` and `choosePageBreak()` with literal dimensions. Assert aspect ratio, content bounds, whole-block page breaks, and visual-plus-caption keep-together behavior.

```ts
expect(fitVisualBlock({ width: 1000, height: 500 }, { maxWidth: 487, maxHeight: 700 }))
  .toEqual({ width: 487, height: 243.5, scale: 0.487 });
expect(choosePageBreak({ remaining: 180, visualHeight: 150, captionHeight: 48 })).toBe(true);
```

- [ ] **Step 2: Implement pure placement helpers and verify GREEN**

Run: `npm test -- tests/core/visual-layout.test.ts`

- [ ] **Step 3: Write renderer integration tests RED**

Create a synthetic PDF whose source pages contain unique colored rectangles. Feed a translated layout containing paragraph/image/caption/math/table blocks. Assert original page sizes/order, companion page counts, embedded visual XObjects, long-text continuation, and absence of companion pages for genuinely blank sources.

- [ ] **Step 4: Implement structured renderer**

```ts
export interface StructuredRenderInput extends TranslatedLayoutDocument {
  title: string;
  sourcePdfBytes: Uint8Array;
  cjkFontBytes: Uint8Array;
}
export interface RenderResult { bytes: Uint8Array; warnings: LayoutWarning[] }
export async function renderStructuredBilingualPdf(input: StructuredRenderInput): Promise<RenderResult>;
```

Retain `renderBilingualPdf()` for text-only fallback. In the structured renderer, copy each original page first. For visual blocks, clamp `[x1,y1,x2,y2]` to source page bounds, call `output.embedPage(sourcePage, { left, bottom, right, top })`, scale with `fitVisualBlock()`, and use `drawPage()`. Move a visual to the next companion page when it does not fit. Preflight an immediately following caption and keep both together when possible. Add `INVALID_RECT` or crop warnings without aborting the full PDF.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- tests/core/visual-layout.test.ts tests/core/render.test.ts && npm run typecheck`

```bash
git add src/core/visual-layout.ts src/core/render.ts tests/core/visual-layout.test.ts tests/core/render.test.ts
git commit -m "feat: place source visuals in translation pages"
```

### Task 5: Integrate structured extraction, fallback, warnings, and progress

**Files:**
- Modify: `src/zotero/workflow.ts`
- Modify: `src/zotero/runtime.ts`
- Modify: `tests/core/workflow.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 and existing fallback APIs.
- Produces: `GenerationResult { outputPath, mode, warnings }` and Zotero progress messaging.

- [ ] **Step 1: Write workflow branch tests RED**

Test three flows: structured success, SDT extraction/decode failure followed by text fallback, and a translation/render failure that must propagate rather than trigger fallback. Assert only extraction/decoding failures select fallback.

```ts
expect(result).toEqual({ outputPath, mode: 'structured', warnings: [] });
expect(fallbackTranslate).not.toHaveBeenCalled();
```

- [ ] **Step 2: Update workflow contracts**

```ts
export interface GenerationResult {
  outputPath: string;
  mode: 'structured' | 'text-fallback';
  warnings: Array<{ code: string; blockId?: string }>;
}
```

Add injected `extractLayout`, `translateLayout`, and `renderLayout` operations while retaining the existing page text operations. Catch errors only around `extractLayout`; set mode to `text-fallback`, then run the existing page pipeline. Merge layout and renderer warnings in structured mode.

- [ ] **Step 3: Update Zotero runtime adapter and progress**

Call `Zotero.PDFWorker.getStructuredDocumentText(attachmentID, { isPriority: true, onProgress })`, decode `result.buf`, and build the layout. Add monotonic stage ranges: analysis 0–15, translation 15–75, visual composition 75–92, save/link 92–100. Final text is `已完成（含图片/公式/表格）`, `已完成，但有 N 个元素未能放置`, or `已完成（已回退为纯文本译文）`.

- [ ] **Step 4: Verify workflow, typecheck, and build**

Run: `npm test -- tests/core/workflow.test.ts && npm run typecheck && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/zotero/workflow.ts src/zotero/runtime.ts tests/core/workflow.test.ts
git commit -m "feat: use structured visual translation workflow"
```

### Task 6: Release 0.3.0 and verify the XPI

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `C:/Users/Administrator/Documents/Codex/2026-09-15/new-chat/outputs/Zotero双语PDF翻译插件使用说明.md`

**Interfaces:**
- Consumes: completed structured and fallback workflows.
- Produces: `outputs/zotero-bilingual-translator-0.3.0.xpi`.

- [ ] **Step 1: Update version and documentation**

Set package and manifest versions to `0.3.0`. Document structured visual reflow, translated captions, original tables, text-only fallback, inline-math limitations, and text-only DeepSeek uploads.

- [ ] **Step 2: Run fresh full verification**

Run: `npm test`

Expected: all test files and tests pass with zero failures.

Run: `npm run typecheck && npm run build && npm run package`

Expected: all commands exit `0` and create `dist/zotero-bilingual-translator-0.3.0.xpi` plus the copy under `outputs`.

- [ ] **Step 3: Inspect the archive**

Run: `tar -tf dist/zotero-bilingual-translator-0.3.0.xpi`

Expected entries: `manifest.json`, `bootstrap.js`, `prefs.js`, `prefs.xhtml`, and `assets/NotoSansSC-VF.ttf`. Extract the bundled manifest and assert version `0.3.0`. Search bundled JavaScript for `getStructuredDocumentText`, the fallback completion label, and structured completion label.

- [ ] **Step 4: Commit**

```bash
git add manifest.json package.json package-lock.json README.md
git commit -m "release: prepare visual reflow translator 0.3.0"
```

- [ ] **Step 5: Manual Zotero acceptance**

Install `outputs/zotero-bilingual-translator-0.3.0.xpi` in Zotero 10. Generate output from single-column, double-column, and complex-table papers. Confirm original pages remain unchanged, main images/display formulas/tables appear near the corresponding translated text, DeepSeek requests contain no visual bytes, fallback is clearly labeled, and the sibling attachment opens.

---

## Plan Self-Review

- Spec coverage: Tasks 1–6 cover SDT decoding, semantic order, text-only translation, visual cropping/reflow, fallback/warnings/progress, privacy, testing, documentation, and release.
- Type consistency: `StructuredDocumentText` flows into `LayoutDocument`, then `TranslatedLayoutDocument`, then `StructuredRenderInput`; workflow returns `GenerationResult` in both modes.
- Scope: OCR, image-text translation, table-cell translation, formula conversion, and pixel-perfect recreation remain excluded.
- Test integrity: each production behavior has a failing-test step before implementation; fixtures use literal expected values and external Zotero/DeepSeek calls remain injected.
- Placeholder scan: no deferred implementation markers remain.
