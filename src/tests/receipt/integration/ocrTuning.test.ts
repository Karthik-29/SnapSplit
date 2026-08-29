import { describe, it, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeDecodedReceiptImage } from '../../../receipt/image/normalize';
import { decodeImageFile } from '../support/nodeImage';
import { nodeReceiptOCR, terminateNodeOcr } from '../support/nodeOcr';
import { realReceiptFixtures } from '../fixtures/realReceiptFixtures';
import { scoreOcrText } from '../support/score';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../../data');

const enabled = process.env.OCR_TUNING === '1';

/**
 * Exploratory only: sweeps preprocessing settings across all four receipts and
 * scores each combination, so tuning is measured rather than eyeballed.
 */
describe.skipIf(!enabled)('OCR preprocessing sweep', () => {
  afterAll(async () => {
    await terminateNodeOcr();
  });

  it('sweeps upscale and contrast', async () => {
    const report: string[] = [];
    const minDimensions = [1400, 1900, 2400];
    const contrasts = [1.0, 1.15, 1.35];

    for (const minDimension of minDimensions) {
      for (const contrast of contrasts) {
        let aggregate = 0;
        const lines: string[] = [];
        for (const fixture of realReceiptFixtures) {
          const decoded = await decodeImageFile(resolve(dataDir, fixture.sourceFile));
          const normalized = normalizeDecodedReceiptImage(decoded, { minDimension, contrast });
          const result = await nodeReceiptOCR.extract(normalized.imageData);
          const score = scoreOcrText(fixture, result.text);
          aggregate += score.score;
          lines.push(`    ${fixture.sourceFile.padEnd(22)} ${(score.score * 100).toFixed(1).padStart(5)}%  names ${score.itemNames.found}/${score.itemNames.total} amts ${score.itemAmounts.found}/${score.itemAmounts.total} summary ${score.summaryAmounts.found}/${score.summaryAmounts.total}  [${normalized.imageData.width}x${normalized.imageData.height}]`);
        }
        report.push(`min=${minDimension} contrast=${contrast} => AGGREGATE ${((aggregate / realReceiptFixtures.length) * 100).toFixed(1)}%`);
        report.push(...lines);
      }
    }

    writeFileSync(resolve(here, '../../../../ocr-sweep.txt'), `${report.join('\n')}\n`);
  }, 1_800_000);
});
