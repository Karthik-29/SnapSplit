import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkItemsAgainstReceiptTotal } from '../bill/reconciliation';
import { BillItem } from '../receipt/models';
import { parseReceipt } from '../receipt/parsing/receiptParser';
import { toLegacyReceipt } from '../receipt/parser';

const items: BillItem[] = [
  { id: 'item-1', name: 'Tofu Biryani', quantity: 2, unitPrice: 180, totalPrice: 360 },
  { id: 'item-2', name: 'Chana Chaat', quantity: 1, unitPrice: 240, totalPrice: 240 },
];

const here = dirname(fileURLToPath(import.meta.url));
const ocrDir = resolve(here, 'receipt/fixtures/ocr');

function loadLegacyReceipt(sourceFile: string) {
  const captured = JSON.parse(readFileSync(resolve(ocrDir, `${sourceFile}.ocr.json`), 'utf8'));
  return toLegacyReceipt(parseReceipt(captured));
}

describe('checkItemsAgainstReceiptTotal', () => {
  it('matches when the items sum to the receipt subtotal', () => {
    const result = checkItemsAgainstReceiptTotal(items, 600, 630);
    expect(result).toMatchObject({ itemSum: 600, referenceLabel: 'subtotal', referenceValue: 600, difference: 0, status: 'match' });
  });

  it('reports a mismatch with the correct signed difference', () => {
    const result = checkItemsAgainstReceiptTotal(items, 650);
    expect(result).toMatchObject({ itemSum: 600, referenceLabel: 'subtotal', referenceValue: 650, difference: -50, status: 'mismatch' });
  });

  it('prefers subtotal over total when both are present', () => {
    const result = checkItemsAgainstReceiptTotal(items, 600, 999);
    expect(result.referenceLabel).toBe('subtotal');
    expect(result.status).toBe('match');
  });

  it('falls back to total when subtotal is unknown', () => {
    const result = checkItemsAgainstReceiptTotal(items, undefined, 600);
    expect(result).toMatchObject({ referenceLabel: 'total', referenceValue: 600, status: 'match' });
  });

  it('reports insufficient_data when neither is known', () => {
    const result = checkItemsAgainstReceiptTotal(items);
    expect(result).toMatchObject({ referenceLabel: null, referenceValue: null, difference: null, status: 'insufficient_data' });
  });

  describe('totalBelowSubtotal', () => {
    it('fires when total is less than subtotal, regardless of item match', () => {
      const result = checkItemsAgainstReceiptTotal(items, 600, 550);
      expect(result.totalBelowSubtotal).toBe(true);
    });

    it('does not fire when total is at or above subtotal', () => {
      expect(checkItemsAgainstReceiptTotal(items, 600, 650).totalBelowSubtotal).toBe(false);
      expect(checkItemsAgainstReceiptTotal(items, 600, 600).totalBelowSubtotal).toBe(false);
    });

    it('does not fire when either value is unknown', () => {
      expect(checkItemsAgainstReceiptTotal(items, 600, undefined).totalBelowSubtotal).toBe(false);
      expect(checkItemsAgainstReceiptTotal(items, undefined, 550).totalBelowSubtotal).toBe(false);
    });
  });

  // Runs the real parser end to end against all four real captured receipts,
  // per billInferenceSpec.md §22 ("verify against real bills, not just
  // synthetic cases"). Statuses below are measured from the actual pipeline
  // output, not assumed from the printed receipt's own arithmetic.
  describe('against the four real captured receipts', () => {
    it('example_bill.webp: items match the OCR subtotal', () => {
      const legacy = loadLegacyReceipt('example_bill.webp');
      const result = checkItemsAgainstReceiptTotal(legacy.items, legacy.subtotal, legacy.total);
      expect(result).toMatchObject({ referenceLabel: 'subtotal', status: 'match', totalBelowSubtotal: false });
    });

    it('sample_bill.jpg: a real mismatch, since CAUSA DE POLLO merges into the next item (see realTokenParse.test.ts)', () => {
      const legacy = loadLegacyReceipt('sample_bill.jpg');
      const result = checkItemsAgainstReceiptTotal(legacy.items, legacy.subtotal, legacy.total);
      // The printed subtotal ($45.85) OCRs to "$45.8%" and is recovered as
      // 45.80 (see realTokenParse.test.ts) — but only 3 of the 4 real rows
      // survive as distinct items (CAUSA DE POLLO's own 8.95 merges into the
      // next item's line), so the item sum is a full 8.95 short, not a
      // one-cent OCR rounding difference.
      expect(result).toMatchObject({ referenceLabel: 'subtotal', status: 'mismatch', difference: -8.95, totalBelowSubtotal: false });
    });

    it('test_bill-1.jpeg: the one recovered item matches the derived subtotal', () => {
      const legacy = loadLegacyReceipt('test_bill-1.jpeg');
      const result = checkItemsAgainstReceiptTotal(legacy.items, legacy.subtotal, legacy.total);
      expect(result).toMatchObject({ referenceLabel: 'subtotal', status: 'match', totalBelowSubtotal: false });
    });

    it('test_bill-2.jpeg: the recoverable items match the OCR subtotal', () => {
      const legacy = loadLegacyReceipt('test_bill-2.jpeg');
      const result = checkItemsAgainstReceiptTotal(legacy.items, legacy.subtotal, legacy.total);
      expect(result).toMatchObject({ referenceLabel: 'subtotal', status: 'match', totalBelowSubtotal: false });
    });
  });
});
