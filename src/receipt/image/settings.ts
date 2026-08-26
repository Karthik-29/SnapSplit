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
  // Measured, not guessed: a hard contrast stretch destroyed more glyphs than it
  // recovered on the real photos. Keep this gentle.
  contrast: 1.15,
  sharpen: false,
};
