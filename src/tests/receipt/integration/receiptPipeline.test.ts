import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../../../receipt/parser';
import { realReceiptFixtures } from '../fixtures/realReceiptFixtures';

describe('real receipt regression fixtures', () => {
  it.each(realReceiptFixtures)('parses manually verified data for $sourceFile', ({ sourceFile, ocrText, expected }) => {
    const sourceUrl = new URL(`../../../data/${sourceFile}`, import.meta.url);
    expect(existsSync(sourceUrl)).toBe(true);

    const parsed = parseReceipt({ text: ocrText, tokens: [] });

    expect(parsed.items.map((item) => ({
      name: item.name.value,
      quantity: item.quantity.value,
      unitPrice: item.unitPrice.value,
      totalPrice: item.totalPrice.value,
    }))).toEqual(expected.items);
    expect(parsed.subtotal?.value).toBe(expected.subtotal);
    expect(parsed.total?.value).toBe(expected.total);
    expect(parsed.reconciliation.status).toBe(expected.reconciliationStatus);
    expect(parsed.diagnostics.lines.some((line) => line.classification === 'payment' && parsed.items.some((item) => item.name.value === line.text))).toBe(false);

    for (const component of expected.taxComponents ?? []) {
      expect(parsed.taxComponents).toEqual(expect.arrayContaining([
        expect.objectContaining({ amount: component.amount, label: expect.stringContaining(component.labelIncludes) }),
      ]));
    }
    for (const adjustment of expected.adjustments ?? []) {
      expect(parsed.adjustments).toEqual(expect.arrayContaining([
        expect.objectContaining({ amount: adjustment.amount, label: expect.stringContaining(adjustment.labelIncludes) }),
      ]));
    }
  });
});
