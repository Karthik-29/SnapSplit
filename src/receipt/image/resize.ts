import { RgbaImage } from '../models';

/**
 * Scales so the longest edge lands within [minDimension, maxDimension].
 *
 * Upscaling is deliberate: after cropping, a receipt can be only a few hundred
 * pixels across, and Tesseract needs a certain glyph height before it resolves
 * digits reliably. maxDimension wins if the two bounds ever conflict.
 */
export function fitWithin(width: number, height: number, maxDimension: number, minDimension = 0) {
  const longest = Math.max(width, height);
  let scale = Math.min(1, maxDimension / longest);
  if (minDimension > 0 && longest * scale < minDimension) {
    scale = Math.min(minDimension / longest, maxDimension / longest);
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Area-average (box filter) resample.
 *
 * This deliberately replaces canvas `drawImage` scaling. Canvas smoothing is
 * implementation-defined, so the browser and Node would otherwise hand Tesseract
 * subtly different pixels and a captured OCR fixture would stop being a faithful
 * stand-in for what the app actually does. Averaging every source pixel in the
 * target footprint is also the right filter for downscaling text: it preserves
 * faint thermal-printer strokes that nearest-neighbour drops outright.
 */
export function resizeImage(source: RgbaImage, width: number, height: number): RgbaImage {
  if (width === source.width && height === source.height) {
    return { data: new Uint8ClampedArray(source.data), width, height };
  }

  const data = new Uint8ClampedArray(width * height * 4);
  const xRatio = source.width / width;
  const yRatio = source.height / height;

  for (let y = 0; y < height; y += 1) {
    const startY = Math.floor(y * yRatio);
    const endY = Math.min(source.height, Math.max(startY + 1, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < width; x += 1) {
      const startX = Math.floor(x * xRatio);
      const endX = Math.min(source.width, Math.max(startX + 1, Math.ceil((x + 1) * xRatio)));
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;
      for (let sourceY = startY; sourceY < endY; sourceY += 1) {
        for (let sourceX = startX; sourceX < endX; sourceX += 1) {
          const offset = (sourceY * source.width + sourceX) * 4;
          red += source.data[offset];
          green += source.data[offset + 1];
          blue += source.data[offset + 2];
          alpha += source.data[offset + 3];
          count += 1;
        }
      }
      const target = (y * width + x) * 4;
      data[target] = red / count;
      data[target + 1] = green / count;
      data[target + 2] = blue / count;
      data[target + 3] = alpha / count;
    }
  }

  return { data, width, height };
}
