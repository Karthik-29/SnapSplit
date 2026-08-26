import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import * as webp from '@cwasm/webp';
import { PNG } from 'pngjs';
import { RgbaImage } from '../../../receipt/models';
import { ImageDecoder } from '../../../receipt/image/decode';

/**
 * Node counterparts to the browser's canvas-backed decode/encode.
 *
 * This module is test-only and must never be imported from application code —
 * it is what keeps `jpeg-js` / `@cwasm/webp` / `pngjs` out of the Vite bundle.
 * Both codecs are pure JS/wasm shipped inside the package, so capture works
 * offline and needs no native build under WSL.
 */

function decodeBytes(bytes: Uint8Array, hint: string): RgbaImage {
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;

  if (isWebp) {
    const decoded = webp.decode(bytes);
    return { data: new Uint8ClampedArray(decoded.data), width: decoded.width, height: decoded.height };
  }
  if (isJpeg) {
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    return { data: new Uint8ClampedArray(decoded.data), width: decoded.width, height: decoded.height };
  }
  if (isPng) {
    const decoded = PNG.sync.read(Buffer.from(bytes));
    return { data: new Uint8ClampedArray(decoded.data), width: decoded.width, height: decoded.height };
  }
  throw new Error(`Unsupported image format for ${hint} (magic ${bytes[0]},${bytes[1]},${bytes[2]},${bytes[3]}).`);
}

export function decodeImageFile(path: string): RgbaImage {
  return decodeBytes(new Uint8Array(readFileSync(path)), path);
}

/** An ImageDecoder backed by Node codecs, for driving the real pipeline in tests. */
export const nodeImageDecoder: ImageDecoder = async (source: Blob): Promise<RgbaImage> => {
  const bytes = new Uint8Array(await source.arrayBuffer());
  return decodeBytes(bytes, 'blob');
};

export function encodePngBuffer(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  return PNG.sync.write(png);
}
