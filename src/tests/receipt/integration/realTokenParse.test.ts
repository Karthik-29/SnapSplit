import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { OCRResult } from '../../../receipt/models';
import { parseReceipt } from '../../../receipt/parsing/receiptParser';
import { realReceiptFixtures } from '../fixtures/realReceiptFixtures';
import { isMetadataLine } from '../../../receipt/parsing/keywordMatcher';
import { PARSED_ITEM_COUNT } from '../support/thresholds';

const here = dirname(fileURLToPath(import.meta.url));
const ocrDir = resolve(here, '../fixtures/ocr');

function loadCaptured(sourceFile: string): OCRResult {
  return JSON.parse(readFileSync(resolve(ocrDir, `${sourceFile}.ocr.json`), 'utf8'));
}

/**
 * Parses the real recorded OCR — bounding boxes and all — rather than
 * hand-transcribed text. This is the only test that reflects what the app
 * actually does end to end.
 */
describe('parsing real captured OCR', () => {
  const report: string[] = [];

  it.each(realReceiptFixtures.map((fixture) => [fixture.sourceFile, fixture] as const))(
    'parses %s without inventing items',
    (sourceFile, fixture) => {
      const parsed = parseReceipt(loadCaptured(sourceFile));

      report.push(`\n########## ${sourceFile} ##########`);
      report.push(`expected ${fixture.expected.items.length} items, parsed ${parsed.items.length}`);
      for (const item of parsed.items) {
        report.push(`  ${String(item.name.value).padEnd(30)} qty=${item.quantity.value} unit=${item.unitPrice.value} total=${item.totalPrice.value}`);
      }
      report.push(`  subtotal=${parsed.subtotal?.value} (${parsed.subtotal?.source}) total=${parsed.total?.value} reconciliation=${parsed.reconciliation.status}`);
      report.push(`  tax=${JSON.stringify(parsed.taxComponents.map((tax) => tax.amount))} charges=${JSON.stringify(parsed.chargeComponents.map((charge) => charge.amount))} adjustments=${JSON.stringify(parsed.adjustments.map((adjustment) => adjustment.amount))}`);
      writeFileSync(resolve(here, '../../../../real-token-parse.txt'), `${report.join('\n')}\n`);

      const bounds = PARSED_ITEM_COUNT[sourceFile];
      expect(parsed.items.length).toBeGreaterThanOrEqual(bounds.min);
      expect(parsed.items.length).toBeLessThanOrEqual(bounds.max);

      for (const item of parsed.items) {
        // Receipt metadata must never reach the bill. A phantom "Table 12" item
        // with a plausible price silently changes what every participant pays,
        // which is the worst failure this pipeline can produce.
        expect(isMetadataLine(String(item.name.value))).toBe(false);
        expect(item.totalPrice.value).toBeGreaterThan(0);
      }
    },
  );
});
