import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decode as decodeJpegWasm } from '@jsquash/jpeg';
import { init as initJpegWasm } from '@jsquash/jpeg/decode.js';
import * as webp from '@cwasm/webp';
import { PNG } from 'pngjs';
import { RgbaImage } from '../../../receipt/models';
import { ImageDecoder } from '../../../receipt/image/decode';

/**
 * Node counterparts to the browser's canvas-backed decode/encode.
 *
 * This module is test-only and must never be imported from application code —
 * it is what keeps these decoders out of the Vite bundle. All are pure JS/wasm
 * shipped inside their packages, so capture works offline and needs no native
 * build under WSL.
 *
 * JPEG specifically is decoded with @jsquash/jpeg (a WASM build of mozjpeg,
 * the same lineage of decoder real browsers use), not the pure-JS `jpeg-js`
 * this used to use. That distinction is not cosmetic: `jpeg-js` is a simple
 * reference decoder whose chroma upsampling/IDCT measurably differs from a
 * browser's, and since the pipeline reconstructs grayscale from RGB (not from
 * the JPEG's own Y channel), that difference propagates into materially
 * different pixels -- confirmed on a real photo, where the browser and the old
 * jpeg-js-based capture produced visibly different OCR text for the identical
 * file. Every fixture this repo captures is only as trustworthy as this
 * decoder's fidelity to the browser.
 */
let jpegWasmReady: Promise<void> | null = null;
async function ensureJpegWasmReady(): Promise<void> {
  if (!jpegWasmReady) {
    const here = dirname(fileURLToPath(import.meta.url));
    const wasmPath = resolve(here, '../../../../node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm');
    jpegWasmReady = WebAssembly.compile(readFileSync(wasmPath)).then((module) => initJpegWasm(module));
  }
  return jpegWasmReady;
}

async function decodeBytes(bytes: Uint8Array, hint: string): Promise<RgbaImage> {
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;

  if (isWebp) {
    const decoded = webp.decode(bytes);
    return { data: new Uint8ClampedArray(decoded.data), width: decoded.width, height: decoded.height };
  }
  if (isJpeg) {
    await ensureJpegWasmReady();
    const decoded = await decodeJpegWasm(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return { data: new Uint8ClampedArray(decoded.data), width: decoded.width, height: decoded.height };
  }
  if (isPng) {
    const decoded = PNG.sync.read(Buffer.from(bytes));
    return { data: new Uint8ClampedArray(decoded.data), width: decoded.width, height: decoded.height };
  }
  throw new Error(`Unsupported image format for ${hint} (magic ${bytes[0]},${bytes[1]},${bytes[2]},${bytes[3]}).`);
}

export async function decodeImageFile(path: string): Promise<RgbaImage> {
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
