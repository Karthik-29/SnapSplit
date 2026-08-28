import { describe, it, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { RgbaImage } from '../../../receipt/models';
import { detectReceiptRegion } from '../../../receipt/image/receiptDetector';
import { cropImageData } from '../../../receipt/image/crop';
import { fitWithin, resizeImage } from '../../../receipt/image/resize';
import { correctIllumination, IlluminationOptions } from '../../../receipt/image/illumination';
import { RECEIPT_PREPROCESSING } from '../../../receipt/image/settings';
import { decodeImageFile } from '../support/nodeImage';
import { nodeReceiptOCR, terminateNodeOcr } from '../support/nodeOcr';
import { realReceiptFixtures } from '../fixtures/realReceiptFixtures';
import { scoreOcrText, aggregateScore } from '../support/score';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../../data');

const enabled = process.env.ILLUMINATION_SWEEP === '1';

function toGray(image: RgbaImage): RgbaImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let index = 0; index < data.length; index += 4) {
    const gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    data[index] = data[index + 1] = data[index + 2] = gray;
    data[index + 3] = image.data[index + 3];
  }
  return { data, width: image.width, height: image.height };
}

function applyContrast(image: RgbaImage, contrast: number): RgbaImage {
  const data = new Uint8ClampedArray(image.data);
  for (let index = 0; index < data.length; index += 4) {
    const value = (data[index] - 128) * contrast + 128;
    data[index] = data[index + 1] = data[index + 2] = value;
  }
  return { data, width: image.width, height: image.height };
}

/** Reproduces normalize+preprocess up to the enhancement step, for the sweep. */
async function prepareGray(sourceFile: string): Promise<RgbaImage> {
  const decoded = await decodeImageFile(resolve(dataDir, sourceFile));
  const region = detectReceiptRegion(decoded);
  const cropped = region.confidence >= 0.6 && region.reason !== 'full_image'
    ? cropImageData(decoded, region.boundingBox)
    : decoded;
  const dims = fitWithin(cropped.width, cropped.height, RECEIPT_PREPROCESSING.maxDimension, RECEIPT_PREPROCESSING.minDimension);
  const resized = resizeImage(cropped, dims.width, dims.height);
  return toGray(resized);
}

/** Exploratory only: sweeps illumination-correction parameters against all four real receipts. */
describe.skipIf(!enabled)('illumination correction sweep', () => {
  afterAll(async () => {
    await terminateNodeOcr();
  });

  it('sweeps configurations', async () => {
    const configs: Array<{ label: string; illumination: IlluminationOptions | null }> = [
      { label: 'off', illumination: null },
      { label: 'shadowOnly0.7,radius0.07', illumination: { blurRadiusFraction: 0.07, shadowOnlyThreshold: 0.7 } },
      { label: 'shadowOnly0.7,radius0.08', illumination: { blurRadiusFraction: 0.08, shadowOnlyThreshold: 0.7 } },
      { label: 'shadowOnly0.75,radius0.08', illumination: { blurRadiusFraction: 0.08, shadowOnlyThreshold: 0.75 } },
      { label: 'shadowOnly0.65,radius0.08', illumination: { blurRadiusFraction: 0.08, shadowOnlyThreshold: 0.65 } },
      { label: 'shadowOnly0.75,radius0.10', illumination: { blurRadiusFraction: 0.10, shadowOnlyThreshold: 0.75 } },
    ];

    const report: string[] = [];
    for (const config of configs) {
      const scores = [];
      for (const fixture of realReceiptFixtures) {
        const gray = await prepareGray(fixture.sourceFile);
        const corrected: RgbaImage = { data: new Uint8ClampedArray(gray.data), width: gray.width, height: gray.height };
        if (config.illumination) correctIllumination(corrected, config.illumination);
        const final = applyContrast(corrected, RECEIPT_PREPROCESSING.contrast);
        const result = await nodeReceiptOCR.extract(final);
        const score = scoreOcrText(fixture, result.text);
        scores.push(score);
      }
      report.push(`\n===== ${config.label} => AGGREGATE ${(aggregateScore(scores) * 100).toFixed(1)}% =====`);
      for (const score of scores) {
        report.push(`  ${score.sourceFile.padEnd(22)} ${(score.score * 100).toFixed(1).padStart(5)}%  names ${score.itemNames.found}/${score.itemNames.total} amts ${score.itemAmounts.found}/${score.itemAmounts.total} summary ${score.summaryAmounts.found}/${score.summaryAmounts.total}`);
      }
    }

    writeFileSync(resolve(here, '../../../../illumination-sweep.txt'), `${report.join('\n')}\n`);
  }, 1_800_000);
});
