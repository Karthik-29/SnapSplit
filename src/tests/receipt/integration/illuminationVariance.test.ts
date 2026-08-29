import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { detectReceiptRegion } from '../../../receipt/image/receiptDetector';
import { cropImageData } from '../../../receipt/image/crop';
import { fitWithin, resizeImage } from '../../../receipt/image/resize';
import { RECEIPT_PREPROCESSING } from '../../../receipt/image/settings';
import { decodeImageFile } from '../support/nodeImage';
import { realReceiptFixtures } from '../fixtures/realReceiptFixtures';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../../data');

const enabled = process.env.ILLUMINATION_VARIANCE === '1';

/** Exploratory only: measures how much local-background variance each real receipt actually has. */
describe.skipIf(!enabled)('illumination background variance', () => {
  it('measures variance per receipt', async () => {
    const report: string[] = [];
    for (const fixture of realReceiptFixtures) {
      const decoded = await decodeImageFile(resolve(dataDir, fixture.sourceFile));
      const region = detectReceiptRegion(decoded);
      const cropped = region.confidence >= 0.6 && region.reason !== 'full_image'
        ? cropImageData(decoded, region.boundingBox)
        : decoded;
      const dims = fitWithin(cropped.width, cropped.height, RECEIPT_PREPROCESSING.maxDimension, RECEIPT_PREPROCESSING.minDimension);
      const resized = resizeImage(cropped, dims.width, dims.height);

      // Coarse downsample (32px long edge) approximates "background" cheaply
      // for this diagnostic only — separate from the real blur implementation.
      const scale = 32 / Math.max(resized.width, resized.height);
      const bw = Math.max(1, Math.round(resized.width * scale));
      const bh = Math.max(1, Math.round(resized.height * scale));
      const bg = resizeImage(resized, bw, bh);

      const luminances: number[] = [];
      for (let i = 0; i < bg.data.length; i += 4) {
        luminances.push(bg.data[i] * 0.299 + bg.data[i + 1] * 0.587 + bg.data[i + 2] * 0.114);
      }
      const mean = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
      const variance = luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminances.length;
      const stdDev = Math.sqrt(variance);
      const min = Math.min(...luminances);
      const max = Math.max(...luminances);

      report.push(`${fixture.sourceFile.padEnd(22)} mean=${mean.toFixed(1)} stdDev=${stdDev.toFixed(1)} range=[${min.toFixed(0)},${max.toFixed(0)}] spread=${(max - min).toFixed(0)}`);
    }
    writeFileSync(resolve(here, '../../../../illumination-variance.txt'), `${report.join('\n')}\n`);
  });
});
