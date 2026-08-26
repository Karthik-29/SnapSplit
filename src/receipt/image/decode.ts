import { RgbaImage } from '../models';

/**
 * Decodes encoded image bytes into raw RGBA at the source's native resolution.
 *
 * Decoding is the only genuinely environment-specific step in the image stage;
 * everything after it (resize, enhancement, region detection, crop) is shared
 * pure code. Injecting the decoder is what lets the Node test harness drive the
 * real browser pipeline.
 */
export type ImageDecoder = (source: Blob) => Promise<RgbaImage>;

export const browserImageDecoder: ImageDecoder = async (source: Blob): Promise<RgbaImage> => {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('Canvas is unavailable for receipt image decoding.');
  }
  // Drawn 1:1 on purpose. Scaling belongs to the shared resize step so that
  // browser and Node produce the same pixels.
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
};
