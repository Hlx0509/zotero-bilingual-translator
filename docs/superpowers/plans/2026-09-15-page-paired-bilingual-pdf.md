# Page-Paired Bilingual PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate a PDF that keeps every source page unchanged and inserts its Chinese translation page(s) immediately afterward.

**Architecture:** Split Zotero PDF Worker full text by its `pageChars` metadata, translate each page independently through the existing chunk translator, and merge copied source pages with newly typeset Chinese pages using `pdf-lib`. Keep Zotero-specific extraction and progress reporting in the runtime adapter; keep page splitting, translation orchestration, and rendering testable without Zotero.

**Tech Stack:** TypeScript, Zotero 10 bootstrap APIs, DeepSeek chat completions, pdf-lib, @pdf-lib/fontkit, Vitest, esbuild.

**Spec:** `docs/superpowers/specs/2026-09-15-page-paired-bilingual-pdf-design.md`

**Global Constraints:** Preserve source pages as PDF page objects rather than rasterizing them. Send only extracted text to DeepSeek. Do not create blank translation pages for source pages without extractable text. Preserve source-page order. Keep all filesystem writes atomic and link the result to the same Zotero parent item.

---

### Task 1: Recover page-scoped text from Zotero PDF Worker output

**Files:**
- Create: `src/core/page-text.ts`
- Test: `tests/core/page-text.test.ts`

**Step 1: Write the failing tests**

Cover exact splitting by `pageChars`, retention of empty pages, normalization of CRLF, and malformed metadata fallback to one page.

```ts
expect(splitTextByPageChars({ text: 'Page 1Page 2', pageChars: [6, 6] }))
  .toEqual([{ pageNumber: 1, text: 'Page 1' }, { pageNumber: 2, text: 'Page 2' }]);
```

**Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/core/page-text.test.ts`

**Step 3: Implement the minimal page splitter**

Define `SourcePage` and `PDFWorkerTextResult`. Validate that `pageChars` contains finite non-negative integers whose sum does not exceed the text length. Slice in order and attach any safe trailing text to the final page. If metadata is absent or invalid, return the normalized full text as page 1.

**Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/core/page-text.test.ts`

**Step 5: Commit**

```bash
git add src/core/page-text.ts tests/core/page-text.test.ts
git commit -m "feat: split extracted PDF text by page"
```

### Task 2: Translate pages independently

**Files:**
- Create: `src/core/page-translation.ts`
- Test: `tests/core/page-translation.test.ts`
- Modify: `src/core/orchestrator.ts`

**Step 1: Write the failing tests**

Verify that page numbers remain stable, blank pages skip the translator, long pages use existing paragraph chunking, and progress includes current/total page and completed/total chunks.

```ts
expect(result.pages.map(page => page.pageNumber)).toEqual([1, 2, 3]);
expect(result.pages[1].translations).toEqual([]);
```

**Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/core/page-translation.test.ts`

**Step 3: Implement page translation orchestration**

Add `translatePages()` that normalizes and chunks each nonblank source page, calls the existing `translateDocument()` with a fingerprint suffixed by page number, flattens translated paragraphs into `TranslatedPage`, and emits page-aware progress. Keep `translateDocument()` unchanged except for reusable exported types.

**Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/core/page-translation.test.ts`

**Step 5: Commit**

```bash
git add src/core/page-translation.ts src/core/orchestrator.ts tests/core/page-translation.test.ts
git commit -m "feat: translate PDF text page by page"
```

### Task 3: Render copied source pages followed by Chinese pages

**Files:**
- Modify: `src/core/render.ts`
- Replace tests: `tests/core/render.test.ts`

**Step 1: Write the failing renderer tests**

Create a two-page source PDF in memory. Verify output order and page counts: two nonblank translations produce four pages; one blank translation produces three. Verify copied source-page dimensions survive and Unicode translation renders.

```ts
expect(output.getPageCount()).toBe(4);
expect(output.getPage(0).getSize()).toEqual(source.getPage(0).getSize());
```

**Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/core/render.test.ts`

**Step 3: Replace the text-only renderer**

Change `RenderInput` to accept `sourcePdfBytes`, `pages`, `title`, and `cjkFontBytes`. Load the source PDF, create the output PDF, register fontkit, copy each source page in sequence, then add A4 translation pages headed `原文第 N 页译文`. Wrap translated paragraphs and automatically continue on extra pages. Add no page when a page has no translation.

**Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/core/render.test.ts`

**Step 5: Commit**

```bash
git add src/core/render.ts tests/core/render.test.ts
git commit -m "feat: preserve original pages in bilingual PDF"
```

### Task 4: Rewire the Zotero workflow and progress UI

**Files:**
- Modify: `src/zotero/workflow.ts`
- Modify: `src/zotero/runtime.ts`
- Modify: `tests/core/workflow.test.ts`

**Step 1: Write the failing workflow tests**

Require the adapter to return `text` plus `pageChars`, read original PDF bytes, pass page translations and bytes to the renderer, keep no-text source pages, and emit `extracting`, `translating`, `merging`, `saving`, `complete` phases.

**Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/core/workflow.test.ts`

**Step 3: Implement the workflow changes**

Replace `extractText()` with `extractPageText()` and add `readSourcePdf()`. Use `splitTextByPageChars()` and `translatePages()`. Reject only when the entire document has no extractable text; otherwise retain empty pages. Pass source bytes into the renderer and rename the rendering phase to `merging`.

**Step 4: Update the Zotero runtime adapter**

Use `Zotero.PDFWorker.getFullText(id, null, true)` and map `{ text, pageChars }`. Read the source with `IOUtils.read`. Display page-aware progress such as `正在翻译第 3 / 12 页（2 / 4 段）`, plus extraction, merging, saving, completion labels.

**Step 5: Run workflow tests, typecheck, and build**

Run: `npm test -- tests/core/workflow.test.ts && npm run typecheck && npm run build`

**Step 6: Commit**

```bash
git add src/zotero/workflow.ts src/zotero/runtime.ts tests/core/workflow.test.ts
git commit -m "feat: generate page-paired bilingual attachments"
```

### Task 5: Document, package, and verify the release artifact

**Files:**
- Modify: `README.md`
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `scripts/package.mjs`
- Modify: `C:/Users/Administrator/Documents/Codex/2026-09-15/new-chat/outputs/Zotero双语PDF翻译插件使用说明.md`

**Step 1: Update user-facing behavior and limitations**

Document page-paired output, preservation of original images/formulas/tables, text-only DeepSeek requests, skipped blank translation pages, output location, and progress stages.

**Step 2: Bump the release to 0.2.0**

Keep package, manifest, and XPI filename consistent. Make the packaging script derive the versioned filename from `manifest.json` to prevent drift.

**Step 3: Run the complete verification suite**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Run: `npm run package`

Inspect the XPI archive and verify `manifest.json`, `bootstrap.js`, `prefs.js`, preference UI files, and the CJK font are present. Load the bundled manifest and assert version 0.2.0.

**Step 4: Commit and publish**

```bash
git add README.md manifest.json package.json scripts/package.mjs
git commit -m "release: prepare page-paired translator 0.2.0"
git push origin main
gh release create v0.2.0 outputs/zotero-bilingual-translator-0.2.0.xpi --title "v0.2.0" --notes "Preserve original PDF pages and insert Chinese translation pages after each source page."
```

**Step 5: Manual Zotero acceptance**

Install the XPI in Zotero 10. Translate a PDF containing body text, images, formulas, and at least one sparse page. Confirm source pages are visually identical, translation pages follow the correct source page, progress advances by page/chunk, the output is written beside the original, and the linked attachment opens.

---

## Plan Review

- Every approved design requirement maps to Tasks 1–5.
- No OCR, image-text translation, formula recognition, or source-layout reconstruction is introduced.
- Public types flow from `SourcePage` to `TranslatedPage` to `RenderInput`; Zotero-only values remain in the runtime adapter.
- Tests cover page boundaries, blank pages, copied page order/dimensions, Unicode, workflow wiring, and progress phases.
- No placeholder implementation is required by the plan.
