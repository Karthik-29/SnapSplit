import { ImagePreprocessingOptions } from '../models';

/**
 * The single source of truth for receipt preprocessing.
 *
 * Both the browser pipeline and the Node fixture-capture harness must use these
 * exact values: a captured OCR fixture is only a faithful stand-in for the
 * browser if the pixels handed to Tesseract were produced the same way.
 *
 * Sharpening stays off deliberately — an unsharp mask erases faint glyphs on
 * thermal paper more often than it recovers them.
 */
export const RECEIPT_PREPROCESSING: Required<ImagePreprocessingOptions> = {
  maxDimension: 2400,
  // A cropped receipt is often only a few hundred pixels wide, which starves
  // Tesseract. Upscaling the crop measurably recovers the numeric columns.
  minDimension: 1900,
  grayscale: true,
  // Tried, measured, and re-measured — twice now. The first sweep (against a
  // since-fixed JPEG decoder bug, see nodeImage.ts) found no configuration
  // that helped everywhere, so this shipped off. After fixing that decoder,
  // a second sweep's *aggregate text-similarity score* looked like a clean
  // win (73.2% -> 84.4% with shadowOnlyThreshold 0.7 + blurRadiusFraction
  // 0.07), but checking actual parsed items — not just the text score —
  // showed it trades one set of problems for a worse one: a real item on
  // sample_bill.jpg corrupted to an invented total (81595), items merging
  // together on test_bill-2.jpeg, and — worst — GST and Round Off summary
  // lines being misread as two fake phantom *items* added straight into the
  // bill. A higher text-similarity score is not the same thing as a
  // trustworthy item list, and this repo tests for text similarity as a
  // convenient proxy, not because it's the thing that actually matters. Left
  // off; illumination.ts stays as tested, working tooling for a future,
  // more surgical attempt (e.g. per-region rather than global correction).
  illuminationCorrection: false,
  // Measured, not guessed: a hard contrast stretch destroyed more glyphs than it
  // recovered on the real photos. Keep this gentle.
  contrast: 1.15,
  sharpen: false,
};
