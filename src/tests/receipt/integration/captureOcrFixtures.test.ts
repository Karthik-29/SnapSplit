import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeDecodedReceiptImage } from '../../../receipt/image/normalize';
import { decodeImageFile } from '../support/nodeImage';
import { nodeReceiptOCR, terminateNodeOcr } from '../support/nodeOcr';
import { realReceiptFixtures } from '../fixtures/realReceiptFixtures';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../../../data');
const outDir = resolve(here, '../fixtures/ocr');

const enabled = process.env.CAPTURE_OCR === '1';

/**
 * Regenerates the committed OCR fixtures from the real receipt photos.
 *
 * Skipped unless CAPTURE_OCR=1, because re-capturing is a deliberate act: if it
 * ran automatically, a parser regression could hide behind freshly recorded
 * input. Run it only when the image stage or OCR settings change, and review the
 * resulting diff.
 */
describe.skipIf(!enabled)('capture OCR fixtures', () => {
  afterAll(async () => {
    await terminateNodeOcr();
  });

  it.each(realReceiptFixtures.map((fixture) => fixture.sourceFile))(
    'captures OCR geometry for %s',
    async (sourceFile) => {
      const decoded = await decodeImageFile(resolve(dataDir, sourceFile));
      const normalized = normalizeDecodedReceiptImage(decoded);
      const result = await nodeReceiptOCR.extract(normalized.imageData);

      expect(result.tokens.length).toBeGreaterThan(0);

      mkdirSync(outDir, { recursive: true });
      const payload = {
        sourceFile,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
        detectedReceiptRegion: normalized.region?.reason === 'content_region'
          ? normalized.region.boundingBox
          : undefined,
        text: result.text,
        tokens: result.tokens,
      };
      writeFileSync(resolve(outDir, `${sourceFile}.ocr.json`), `${JSON.stringify(payload, null, 2)}\n`);
    },
    180_000,
  );
});
