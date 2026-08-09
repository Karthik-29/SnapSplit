import { createWorker } from 'tesseract.js';
import { OCRResult, ReceiptOCR } from './models';

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
  workerInitialized = true;
}

export const realReceiptOCR: ReceiptOCR = {
  async extract(file: File): Promise<OCRResult> {
    await ensureWorkerReady();
    const { data } = await worker.recognize(file, 'eng');
    const words = data.words || [];

    const tokens = words.map((word: any) => ({
      text: word.text,
      confidence: word.confidence,
      boundingBox: [
        word.bbox.x0,
        word.bbox.y0,
        word.bbox.x1,
        word.bbox.y1,
      ] as [number, number, number, number],
    }));

    return {
      text: data.text,
      tokens,
    };
  },
};

const mockReceiptText = `Tofu Biryani     2     360
Masala Dosa      1     180
Chana Chaat      1     220
Lime Soda        2     160
Subtotal         920
Tax              20
Total            940`;

export const mockReceiptOCR: ReceiptOCR = {
  async extract(file: File): Promise<OCRResult> {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        const tokens = mockReceiptText.split('\n').map((line) => ({ text: line }));
        resolve({ text: mockReceiptText, tokens });
      }, 150);
    });
  },
};
