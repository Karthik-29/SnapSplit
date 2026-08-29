/**
 * Accuracy floors, per receipt.
 *
 * These ratchet UP as the pipeline improves and must never be lowered without a
 * comment saying why — a lowered floor is how a regression gets normalised.
 * Values are set just under the measured score so ordinary OCR jitter does not
 * make the suite flaky.
 *
 * RECALIBRATED: the Node capture harness used to decode JPEGs with `jpeg-js`
 * (a simple pure-JS reference decoder), while the browser decodes via
 * `createImageBitmap`+canvas (a browser-native, typically libjpeg-turbo-class
 * decoder). Since this pipeline reconstructs grayscale from decoded RGB (not
 * from the JPEG's own luma channel), that decoder difference produced
 * genuinely different pixels and therefore different OCR text — confirmed by
 * literal text comparison against a real browser session, where the old
 * jpeg-js-decoded capture and the browser's own OCR output did not match.
 * `nodeImage.ts` now decodes JPEGs with `@jsquash/jpeg` (a WASM build of
 * mozjpeg), and Node's output is now byte-for-byte identical to the browser's
 * for the one receipt this was checked against. Every score below is honest
 * in a way the pre-recalibration numbers (kept here in comments for the
 * record) never were: example_bill.webp is a .webp file and its decoder was
 * never touched, so it is unaffected.
 */
export const OCR_QUALITY_FLOOR: Record<string, number> = {
  // Measured 100.0% — unaffected (.webp decode was never in question).
  'example_bill.webp': 0.95,
  // Measured 72.7% (previously 90.9%, measured against the wrong decoder).
  // CAUSA DE POLLO's own row now merges into CEVICHE DE CAMARONES's line.
  'sample_bill.jpg': 0.65,
  // Measured 50.0% (previously 66.7%, measured against the wrong decoder).
  // The column-header row is unrecognizable, and a separate garbled
  // header/footer line is misread as a spurious item (see PARSED_ITEM_COUNT).
  'test_bill-1.jpeg': 0.45,
  // Measured 80.0% (previously 86.7%, measured against the wrong decoder).
  // Genuinely better in one respect: Vietnamese Iced Coffee's total (280) now
  // survives, matching a live browser session exactly.
  'test_bill-2.jpeg': 0.75,
};

/**
 * Aggregate across all four. Measured 75.7% against the corrected decoder
 * (previously 84.4%/86.1% at different points, always against jpeg-js).
 */
export const OCR_QUALITY_AGGREGATE_FLOOR = 0.75;

/**
 * Item counts the parser currently produces from the real captured OCR.
 *
 * These record what the pipeline actually does today, not what we wish it did.
 * The upper bound is the guard that matters: it fails if the parser starts
 * inventing items again. Narrow these as extraction improves.
 *
 * Recalibrated alongside OCR_QUALITY_FLOOR above (see that comment).
 */
export const PARSED_ITEM_COUNT: Record<string, { min: number; max: number }> = {
  // Exact: all four items parse cleanly.
  'example_bill.webp': { min: 4, max: 4 },
  // CAUSA DE POLLO's row now merges into the next item's line (see
  // OCR_QUALITY_FLOOR) — 3, not 4, real rows survive as distinct items.
  'sample_bill.jpg': { min: 3, max: 4 },
  // Exact: only BLACK COFFEE survives (MASALA DOSA is genuinely too faint in
  // the photo). A garbled non-item line ("SRR TOSY 200 75.00 15000" — likely a
  // badly OCR'd summary/footer row, unidentified) used to be misread as a
  // second item with an internally-consistent-looking but almost certainly
  // fabricated ₹15,000 total (200 x 75.00 = 15000 exactly, so no arithmetic
  // check caught it) — fixed by rejecting any resolved quantity above
  // MAX_PLAUSIBLE_ITEM_QUANTITY in receiptParser.ts's `parseItem` (no real
  // receipt in realReceiptFixtures.ts prints a line-item quantity above 4).
  'test_bill-1.jpeg': { min: 1, max: 1 },
  // Five real items plus up to two fragments: this receipt is skewed enough
  // that stray marks land in the amount area of a wrapped description line.
  'test_bill-2.jpeg': { min: 5, max: 7 },
};
