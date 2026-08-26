/**
 * Accuracy floors, per receipt.
 *
 * These ratchet UP as the pipeline improves and must never be lowered without a
 * comment saying why — a lowered floor is how a regression gets normalised.
 * Values are set just under the measured score so ordinary OCR jitter does not
 * make the suite flaky.
 */
export const OCR_QUALITY_FLOOR: Record<string, number> = {
  // Measured 100.0% — a clean, near-flat scan.
  'example_bill.webp': 0.95,
  // Measured 90.9% — the crop removes the watermark border.
  'sample_bill.jpg': 0.85,
  // Measured 66.7% — low-resolution photo, receipt partly hand-occluded, and
  // the MASALA DOSA row is genuinely faint in the source.
  'test_bill-1.jpeg': 0.6,
  // Measured 86.7% — all five item names now survive OCR.
  'test_bill-2.jpeg': 0.8,
};

/** Aggregate across all four. Baseline before the image-stage rework was 84.4%. */
export const OCR_QUALITY_AGGREGATE_FLOOR = 0.84;

/**
 * Item counts the parser currently produces from the real captured OCR.
 *
 * These record what the pipeline actually does today, not what we wish it did.
 * The upper bound is the guard that matters: it fails if the parser starts
 * inventing items again. Narrow these as extraction improves.
 */
export const PARSED_ITEM_COUNT: Record<string, { min: number; max: number }> = {
  // Exact: all four items parse cleanly.
  'example_bill.webp': { min: 4, max: 4 },
  // Exact: all four items parse cleanly.
  'sample_bill.jpg': { min: 4, max: 4 },
  // Only BLACK COFFEE survives; the MASALA DOSA row is too faint in the photo
  // for OCR to produce a name or an amount.
  'test_bill-1.jpeg': { min: 1, max: 2 },
  // Five real items plus up to two fragments: this receipt is skewed enough
  // that stray marks land in the amount area of a wrapped description line.
  'test_bill-2.jpeg': { min: 5, max: 7 },
};
