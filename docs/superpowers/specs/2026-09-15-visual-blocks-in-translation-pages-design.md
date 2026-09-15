# Visual Blocks in Translation Pages Design

## Goal

Extend the page-paired bilingual PDF output so each reconstructed Chinese translation page includes the source page's images, display formulas, and tables near the translated text they belong to. Preserve readability and semantic reading order rather than reproducing the source page's exact coordinates.

The output remains:

1. Original source page 1, unchanged.
2. One or more reconstructed Chinese companion pages for source page 1.
3. Original source page 2, unchanged.
4. One or more reconstructed Chinese companion pages for source page 2.
5. Continue in source-page order.

## Confirmed Product Decisions

- Use readability-first reflow, not in-place replacement of English text.
- Preserve images and display formulas as original visual content.
- Preserve each table as one visual block; do not translate individual table cells.
- Translate captions as text and place them next to their associated visual block when the source structure provides that association.
- Send text only to DeepSeek. Never upload the PDF, images, formulas, or tables.
- Inline formulas are best-effort. Display formulas identified by Zotero's structure model are the reliable target.

## Source Structure

Use `Zotero.PDFWorker.getStructuredDocumentText()` as the primary extraction path. Zotero returns a packed Structured Document Text (SDT) buffer. The plugin will include a pinned, minimal decoder compatible with the Zotero SDT pack format and convert the result into a plugin-owned intermediate model.

The SDT schema provides:

- semantic block types such as paragraph, heading, list, caption, image, math, and table;
- top-level document reading order;
- page metadata and content ranges;
- PDF anchors containing page-indexed source rectangles.

The plugin must not expose SDT-specific structures beyond the adapter. This isolates format-version compatibility and makes fallback behavior testable.

## Intermediate Model

The layout adapter produces ordered page content:

```ts
interface LayoutDocument {
  pages: LayoutPage[];
  warnings: LayoutWarning[];
}

interface LayoutPage {
  pageNumber: number;
  blocks: LayoutBlock[];
}

type LayoutBlock =
  | {
      id: string;
      type: 'text';
      role: 'heading' | 'paragraph' | 'list' | 'caption' | 'note';
      sourceText: string;
    }
  | {
      id: string;
      type: 'visual';
      role: 'image' | 'display-math' | 'table';
      pageNumber: number;
      rect: [number, number, number, number];
    };
```

Nested text containers are flattened without changing their SDT order. A block with multiple `pageRects` is split into one visual block per source page. Invalid or empty rectangles produce warnings and are omitted.

## Reading Order and Association

- Use SDT content order as the authoritative semantic reading order, including multi-column pages.
- Assign each text block to the page indicated by its PDF anchor or the page catalog's content range.
- Insert image, math, and table blocks at their SDT position.
- Keep captions as separately translated text blocks.
- When a caption immediately follows a visual block, keep them together during pagination when space permits.
- Do not infer a new order from raw X/Y sorting unless SDT lacks usable ordering. The fallback for missing structure is the existing page-level text flow.

## Translation

Only `text` blocks are translated. Each request carries stable block IDs so responses can be restored to their exact positions. Visual blocks never enter the DeepSeek request.

The existing retry, cancellation, response validation, and cache behavior remain. Cache keys include the source attachment fingerprint, block source text, target language, and model. Headings, paragraphs, list items, captions, and notes remain separate blocks in the output.

## Visual Extraction

Use `pdf-lib` to load the original PDF and embed clipped regions from each source page:

1. Resolve the visual block's source page and rectangle.
2. Clamp the rectangle to the page's crop box.
3. Embed only that bounding box from the source page.
4. Draw the embedded region onto the translation page at the available column width.

This retains source vector and raster content where supported by `pdf-lib` and avoids screenshot-quality loss. The crop includes everything inside the source rectangle. Tight SDT anchors are therefore required; loose or overlapping anchors are reported as warnings.

## Reflow Rendering

Translation pages use a single readable column. The renderer consumes ordered translated text and visual blocks:

- Headings use a larger, heavier style.
- Body text, lists, notes, and captions use distinct spacing.
- Visual blocks preserve aspect ratio.
- Blocks wider than the content column are scaled down.
- Blocks taller than the printable area are scaled down to fit one page.
- If a complete visual block does not fit the remaining page height, move it to the next page.
- Do not split an image, display formula, or table across output pages.
- Keep an immediately following caption with its visual block when both fit together.
- Long text may flow across multiple companion pages.

A source page with text or visual blocks receives at least one companion page. A genuinely blank source page receives no empty companion page.

## Existing Original Pages

Every original PDF page is still copied unchanged before its companion page or pages. This guarantees the complete original page remains available even when structured extraction misses a visual element or crops it imperfectly.

## Fallback and Warnings

Fallback must preserve successful translation rather than fail the entire document:

- If SDT extraction or decoding fails, use the current page-delimited text extractor and text-only companion pages.
- If a single block has no usable rectangle, omit that visual block, continue rendering, and record a warning.
- If a crop cannot be embedded, omit it, continue rendering, and record a warning.
- If source pages are encrypted or cannot be loaded, stop before writing output and show a clear error.
- Warnings appear in the final Zotero progress window summary and in Zotero's debug log.

Fallback does not silently claim full visual preservation. The completion message distinguishes full structured output from text-only fallback.

## Progress Reporting

Progress phases become:

1. Analyzing document layout.
2. Translating text blocks, with current source page and block counts.
3. Extracting and placing visual blocks.
4. Combining original and companion pages.
5. Saving and linking the attachment.

The overall percentage remains monotonic across phases.

## Privacy

- DeepSeek receives only extracted textual blocks.
- Visual crops are generated locally from the source PDF.
- The original PDF remains unchanged.
- The output is written beside the source file using the existing unique sibling naming rule.

## Testing

### Unit Tests

- Decode representative SDT fixtures into the intermediate model.
- Preserve semantic block order across text, images, math, tables, and captions.
- Split multi-page visual anchors correctly.
- Reject or warn on invalid rectangles.
- Exclude every visual block from DeepSeek requests.
- Restore translated text by stable block ID.
- Calculate aspect-preserving placement and page-break decisions.
- Keep visual blocks whole and keep captions with them when possible.
- Trigger text-only fallback on SDT extraction or decode failure.

### Renderer Integration Tests

- Build synthetic source PDFs with distinct page sizes and visual regions.
- Verify original pages remain in source order.
- Verify companion pages contain embedded visual XObjects and translated text.
- Verify oversized visual blocks are scaled within printable bounds.
- Verify long translated text creates continuation pages without splitting visual blocks.

### Manual Acceptance

Test at least:

1. A single-column paper with figures and display equations.
2. A double-column paper with a cross-column figure and translated caption.
3. A paper with a complex table, inline math, and content spanning pages.

Acceptance requires the main images, display formulas, and tables to appear near the semantically corresponding translated paragraphs. Pixel-identical coordinates are not required. Inline formula preservation is best-effort and special mathematical fonts may remain unsupported.

## Non-Goals

- Translating text baked into images.
- Translating table cells or rebuilding table structure.
- Converting formulas to editable LaTeX or MathML.
- Pixel-perfect recreation of the original page layout.
- Guaranteeing detection of every inline formula.
- OCR for scanned PDFs.

## Release

Ship this as version `0.3.0`. Update the README and Chinese usage guide to describe structured visual reflow, its fallback behavior, and the limits around inline math and image/table text.
