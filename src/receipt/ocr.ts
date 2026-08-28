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

  // Without an explicit langPath, tesseract.js fetches eng.traineddata from a
  // third-party CDN (tessdata.projectnaptha.com) that has no relationship to
  // this repo's own committed eng.traineddata -- the file the Node capture
  // harness (nodeOcr.ts) and every accuracy score in this repo are measured
  // against. Pointing the browser at the same model (served from public/,
  // gzip-compressed) is what makes the measured OCR-quality numbers actually
  // apply to what a user sees. Must be a fully-qualified URL, not a
  // path-absolute one: tesseract.js's worker runs from a blob: URL, whose base
  // has no origin to resolve a leading "/" against ("Failed to parse URL from
  // /eng.traineddata.gz"), so the origin has to be resolved here on the main
  // thread instead. cachePath is bumped so a browser that already cached the
  // old CDN-fetched model in IndexedDB fetches the local one instead of
  // reusing the stale entry.
  worker = await createWorker({
    langPath: window.location.origin,
    cachePath: 'snapsplit-local-v1',
  } as any);
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
