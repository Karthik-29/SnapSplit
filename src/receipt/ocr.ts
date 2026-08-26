import { createWorker } from 'tesseract.js';
import { OCRResult, ReceiptOCR, RgbaImage } from './models';
import { imageDataToBlob } from './image/crop';
import { normalizeReceiptImage } from './image/normalize';
import { tesseractWordsToTokens } from './tesseractTokens';

let worker: any = null;
let workerInitialized = false;

async function ensureWorkerReady() {
  if (workerInitialized && worker) {
    return;
  }

  worker = await createWorker();
  await worker.load();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  await worker.setParameters({
    // Receipt images are a single dense text block; this is more reliable than
    // the default automatic layout mode for narrow thermal-paper photos.
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
  });
  workerInitialized = true;
}

function isRgbaImage(input: Blob | RgbaImage): input is RgbaImage {
  return 'data' in input && 'width' in input && 'height' in input;
}

export function supportsWebGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export const realReceiptOCR: ReceiptOCR = {
  async extract(image: Blob | RgbaImage): Promise<OCRResult> {
    await ensureWorkerReady();
    // Raw pixels have already been normalized by the pipeline; only an encoded
    // blob still needs preprocessing, and it uses the shared settings.
    const normalized = isRgbaImage(image)
      ? { imageData: image, region: undefined, originalWidth: image.width, originalHeight: image.height }
      : await normalizeReceiptImage(image);
    const processedFile = await imageDataToBlob(normalized.imageData);
    const { data } = await worker.recognize(processedFile, 'eng');

    return {
      text: data.text,
      tokens: tesseractWordsToTokens(data.words),
      imageWidth: normalized.imageData.width,
      imageHeight: normalized.imageData.height,
      detectedReceiptRegion: normalized.region?.boundingBox,
      preprocessing: {
        sourceWidth: normalized.originalWidth,
        sourceHeight: normalized.originalHeight,
        outputWidth: normalized.imageData.width,
        outputHeight: normalized.imageData.height,
        cropped: normalized.region?.reason === 'content_region',
        regionConfidence: normalized.region?.confidence,
      },
    };
  },
};
