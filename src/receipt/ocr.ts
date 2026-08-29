import { createWorker } from 'tesseract.js';
// Self-hosted, version-pinned tesseract runtime. Without these, tesseract.js v4
// fetches its worker script from cdn.jsdelivr.net and its core WASM from
// cdn.jsdelivr.net/tesseract.js-core at runtime -- unpinned, no SRI, a
// third-party code-execution dependency in the deployed app. The `?url` suffix
// makes Vite copy each file into the app's own bundle (content-hashed) and hand
// back a same-origin path, which tesseract.js resolves to an absolute URL
// itself (src/utils/resolvePaths). The SIMD core is loaded unconditionally;
// every browser we target has had WebAssembly SIMD since 2021.
import tesseractWorkerPath from 'tesseract.js/dist/worker.min.js?url';
import tesseractCorePath from 'tesseract.js-core/tesseract-core-simd.wasm.js?url';
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
  // against. Serving the same model from public/ (gzip-compressed) is what makes
  // the measured OCR-quality numbers actually apply to what a user sees.
  // cachePath is bumped so a browser that already cached the old CDN-fetched
  // model in IndexedDB fetches the local one instead of reusing the stale entry.
  worker = await createWorker({
    // eng.traineddata.gz sits in public/, i.e. under the app's base path
    // (import.meta.env.BASE_URL -- "/SnapSplit/" in prod, "/" in dev). Resolve
    // it to an absolute URL here on the main thread: the worker runs from a
    // blob: URL with no origin to resolve a path-relative value against.
    // tesseract.js strips the trailing slash and appends "/eng.traineddata.gz".
    langPath: new URL(import.meta.env.BASE_URL, window.location.origin).href,
    workerPath: tesseractWorkerPath,
    corePath: tesseractCorePath,
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
