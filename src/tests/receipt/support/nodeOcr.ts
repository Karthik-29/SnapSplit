import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { OCRResult, ReceiptOCR, RgbaImage } from '../../../receipt/models';
import { tesseractWordsToTokens } from '../../../receipt/tesseractTokens';
import { encodePngBuffer } from './nodeImage';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

let worker: any = null;

/**
 * Tesseract in Node, reading the `eng.traineddata` committed at the repo root so
 * fixture capture works offline.
 *
 * The parameters here must match the browser worker in `src/receipt/ocr.ts` —
 * page-segmentation mode in particular changes the output substantially, and a
 * fixture captured under different settings would not represent the real app.
 */
async function ensureWorker() {
  if (worker) return worker;
  worker = await createWorker({
    langPath: repoRoot,
    gzip: false,
    cachePath: repoRoot,
  } as any);
  await worker.load();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
  });
  return worker;
}

export async function terminateNodeOcr() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

export const nodeReceiptOCR: ReceiptOCR = {
  async extract(image: Blob | RgbaImage): Promise<OCRResult> {
    if (!('data' in image)) {
      throw new Error('The Node OCR harness expects raw pixels, not an encoded blob.');
    }
    const active = await ensureWorker();
    const { data } = await active.recognize(encodePngBuffer(image), 'eng');
    return {
      text: data.text,
      tokens: tesseractWordsToTokens(data.words),
      imageWidth: image.width,
      imageHeight: image.height,
    };
  },
};
