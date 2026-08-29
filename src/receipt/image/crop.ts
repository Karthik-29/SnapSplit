import { BoundingBox, RgbaImage } from '../models';

export function createRgbaImage(width: number, height: number): RgbaImage {
  return { data: new Uint8ClampedArray(Math.max(1, width) * Math.max(1, height) * 4), width, height };
}

export function cropImageData(source: RgbaImage, bounds: BoundingBox): RgbaImage {
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(source.width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(source.height, Math.ceil(bounds.y + bounds.height));
  const result = createRgbaImage(Math.max(1, right - left), Math.max(1, bottom - top));
  for (let y = top; y < bottom; y += 1) {
    const start = (y * source.width + left) * 4;
    const end = (y * source.width + right) * 4;
    result.data.set(source.data.subarray(start, end), (y - top) * result.width * 4);
  }
  return result;
}

/** Browser-only: encodes pixels for an OCR engine that takes an image blob. */
export async function imageDataToBlob(image: RgbaImage): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable for receipt OCR.');
  // Copied into a fresh buffer: ImageData requires a non-shared ArrayBuffer.
  const pixels = new Uint8ClampedArray(image.data);
  context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to encode processed receipt image.')), 'image/png'));
}
