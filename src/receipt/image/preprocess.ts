import { ImagePreprocessingOptions, RgbaImage } from '../models';
import { browserImageDecoder, ImageDecoder } from './decode';
import { correctIllumination } from './illumination';
import { fitWithin, resizeImage } from './resize';
import { RECEIPT_PREPROCESSING } from './settings';

export type PreprocessedReceiptImage = {
  imageData: RgbaImage;
  sourceWidth: number;
  sourceHeight: number;
};

function applyEnhancements(image: RgbaImage, options: Required<ImagePreprocessingOptions>) {
  const { data } = image;
  if (options.grayscale) {
    if (options.illuminationCorrection) {
      // Illumination correction needs a real intermediate grayscale value to
      // blur, so this path unavoidably rounds through Uint8ClampedArray
      // twice (once here, once applying contrast below). Off by default (see
      // settings.ts), so this extra rounding only affects the opt-in path.
      for (let index = 0; index < data.length; index += 4) {
        const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
        data[index] = data[index + 1] = data[index + 2] = gray;
      }
      correctIllumination(image, { shadowOnlyThreshold: 0.7 });
      for (let index = 0; index < data.length; index += 4) {
        const value = (data[index] - 128) * options.contrast + 128;
        data[index] = data[index + 1] = data[index + 2] = value;
      }
    } else {
      // Single pass, single rounding: grayscale and contrast are computed
      // together in floating point before the one write to the (rounding)
      // Uint8ClampedArray, matching this pipeline's demonstrated sensitivity
      // to small pixel-level differences.
      for (let index = 0; index < data.length; index += 4) {
        const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
        const value = (gray - 128) * options.contrast + 128;
        data[index] = data[index + 1] = data[index + 2] = value;
      }
    }
  }

  if (!options.sharpen) return;
  // A small unsharp mask is deliberately optional: aggressive thresholding or
  // sharpening can remove faint thermal-printer glyphs.
  const copy = new Uint8ClampedArray(data);
  const width = image.width;
  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      const neighbors = copy[offset - 4] + copy[offset + 4] + copy[offset - width * 4] + copy[offset + width * 4];
      const sharpened = Math.max(0, Math.min(255, copy[offset] * 1.5 - neighbors * 0.125));
      data[offset] = data[offset + 1] = data[offset + 2] = sharpened;
    }
  }
}

export async function preprocessReceiptImage(
  source: Blob,
  input: ImagePreprocessingOptions = {},
  decode: ImageDecoder = browserImageDecoder,
): Promise<PreprocessedReceiptImage> {
  const options = { ...RECEIPT_PREPROCESSING, ...input };
  const decoded = await decode(source);
  const dimensions = fitWithin(decoded.width, decoded.height, options.maxDimension, options.minDimension);
  const imageData = resizeImage(decoded, dimensions.width, dimensions.height);
  applyEnhancements(imageData, options);
  return { imageData, sourceWidth: decoded.width, sourceHeight: decoded.height };
}

/** Preprocesses already-decoded pixels, for callers that hold raw RGBA. */
export function preprocessDecodedImage(
  decoded: RgbaImage,
  input: ImagePreprocessingOptions = {},
): PreprocessedReceiptImage {
  const options = { ...RECEIPT_PREPROCESSING, ...input };
  const dimensions = fitWithin(decoded.width, decoded.height, options.maxDimension, options.minDimension);
  const imageData = resizeImage(decoded, dimensions.width, dimensions.height);
  applyEnhancements(imageData, options);
  return { imageData, sourceWidth: decoded.width, sourceHeight: decoded.height };
}
