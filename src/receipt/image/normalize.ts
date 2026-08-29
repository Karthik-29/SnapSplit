import { ImagePreprocessingOptions, ReceiptRegionCandidate, RgbaImage } from '../models';
import { cropImageData } from './crop';
import { browserImageDecoder, ImageDecoder } from './decode';
import { preprocessDecodedImage } from './preprocess';
import { detectReceiptRegion } from './receiptDetector';

export type NormalizedReceiptImage = {
  imageData: RgbaImage;
  region: ReceiptRegionCandidate | undefined;
  originalWidth: number;
  originalHeight: number;
};

/** Only a confident region is worth cropping to; otherwise OCR the full image. */
const CROP_CONFIDENCE = 0.6;

function isRgbaImage(source: Blob | RgbaImage): source is RgbaImage {
  return 'data' in source && 'width' in source && 'height' in source;
}

/**
 * Detect on colour, crop, then enhance.
 *
 * Order matters: region detection reads saturation to tell paper from skin and
 * background, so it has to run before grayscale conversion. Cropping first also
 * means the resize budget is spent on the receipt rather than on the floor
 * around it, which is what actually gives OCR enough pixels per glyph.
 */
export function normalizeDecodedReceiptImage(
  decoded: RgbaImage,
  options?: ImagePreprocessingOptions,
): NormalizedReceiptImage {
  const candidate = detectReceiptRegion(decoded);
  const shouldCrop = candidate.confidence >= CROP_CONFIDENCE && candidate.reason !== 'full_image';
  const source = shouldCrop ? cropImageData(decoded, candidate.boundingBox) : decoded;
  const processed = preprocessDecodedImage(source, options);

  return {
    imageData: processed.imageData,
    region: { ...candidate, reason: shouldCrop ? 'content_region' : 'full_image' },
    originalWidth: decoded.width,
    originalHeight: decoded.height,
  };
}

export async function normalizeReceiptImage(
  source: Blob | RgbaImage,
  options?: ImagePreprocessingOptions,
  decode: ImageDecoder = browserImageDecoder,
): Promise<NormalizedReceiptImage> {
  if (isRgbaImage(source)) {
    return { imageData: source, region: undefined, originalWidth: source.width, originalHeight: source.height };
  }
  return normalizeDecodedReceiptImage(await decode(source), options);
}
