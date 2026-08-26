import { describe, it, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { cropImageData } from '../../../receipt/image/crop';
import { preprocessDecodedImage } from '../../../receipt/image/preprocess';
import { resizeImage } from '../../../receipt/image/resize';
import { decodeImageFile } from '../support/nodeImage';
import { nodeReceiptOCR, terminateNodeOcr } from '../support/nodeOcr';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../../data');

const enabled = process.env.CROP_PROBE === '1';

/** Exploratory only: proves how much a correct receipt crop is worth to OCR. */
describe.skipIf(!enabled)('manual crop probe', () => {
  afterAll(async () => {
    await terminateNodeOcr();
  });

  it('OCRs a hand-specified receipt region', async () => {
    const decoded = decodeImageFile(resolve(dataDir, 'test_bill-1.jpeg'));
    // Hand-measured receipt bounds, as a stand-in for working region detection.
    const bounds = { x: 40, y: 325, width: 485, height: 570 };
    const cropped = cropImageData(decoded, bounds);
    const report: string[] = [`native ${decoded.width}x${decoded.height} crop ${cropped.width}x${cropped.height}`];

    for (const scale of [1, 2, 3, 4]) {
      for (const contrast of [1.0, 1.3]) {
        const scaled = resizeImage(cropped, Math.round(cropped.width * scale), Math.round(cropped.height * scale));
        const processed = preprocessDecodedImage(scaled, { maxDimension: 100000, contrast, grayscale: true });
        const result = await nodeReceiptOCR.extract(processed.imageData);
        report.push(`\n===== scale=${scale} contrast=${contrast} => ${processed.imageData.width}x${processed.imageData.height} tokens=${result.tokens.length} =====`);
        report.push(result.text.split('\n').filter((line) => line.trim()).join('\n'));
      }
    }

    writeFileSync(resolve(here, '../../../../ocr-crop-probe.txt'), `${report.join('\n')}\n`);
  }, 900_000);
});
