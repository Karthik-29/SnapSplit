import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../../../receipt/parser';
import { OCRToken } from '../../../receipt/models';

/** Matches the geometry-fixture helper used in layout.test.ts. */
function token(text: string, x: number, y: number): OCRToken {
  return { text, boundingBox: { x, y, width: text.length * 8, height: 14 }, confidence: 90 };
}

describe('receipt parser edge cases', () => {
  it('keeps wrapped item descriptions together and extracts quantity, unit price, and total', () => {
    const parsed = parseReceipt({
      text: `Item Qty Amt
Red Cotta
Pizza - Mini 1 260.00
Sub Total 260.00
Total 260.00`,
      tokens: [],
    });

    expect(parsed.items[0]).toMatchObject({
      name: { value: 'Red Cotta Pizza - Mini' },
      quantity: { value: 1 },
      unitPrice: { value: 26000 },
      totalPrice: { value: 26000 },
    });
  });

  it('separates charges, discounts, adjustments, and tax from purchased items', () => {
    const parsed = parseReceipt({
      text: `DESCRIPTION QTY RATE AMOUNT
NOODLES 1 100.00 100.00
Subtotal 100.00
Service Charge 10.00
Discount 5.00
CGST 2.50
SGST 2.50
Round Off -0.50
Grand Total 109.50
Paid by card 109.50`,
      tokens: [],
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.chargeComponents).toEqual([expect.objectContaining({ amount: 1000 })]);
    expect(parsed.adjustments).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Discount', amount: -500 }),
      expect.objectContaining({ label: 'Round Off', amount: -50 }),
    ]));
    expect(parsed.taxComponents.map((tax) => tax.amount)).toEqual([250, 250]);
    expect(parsed.total?.value).toBe(10950);
    expect(parsed.reconciliation.status).toBe('match');
  });

  it('retains multiple total candidates and chooses the strongest final total', () => {
    const parsed = parseReceipt({
      text: `Item Qty Amt
TEA 1 20.00
Sub Total 20.00
Total Qty 1
Amount Due 20.00
Grand Total 20.00`,
      tokens: [],
    });

    expect(parsed.diagnostics.candidateTotals.length).toBeGreaterThanOrEqual(2);
    expect(parsed.total?.value).toBe(2000);
  });

  it('ignores metadata and returns partial bills for malformed OCR', () => {
    const parsed = parseReceipt({
      text: `Phone 9999999999
Server 4
Item Qty Amt
SOUP
Subtotal 0.00
Total 0.00`,
      tokens: [],
    });

    expect(parsed.items).toEqual([]);
    expect(parsed.diagnostics.ignoredLines).toContain('Phone 9999999999');
    expect(parsed.reconciliation.status).toBe('match');
  });

  it('treats an equal rate/amount pair as a single unit, not a mismatched quantity', () => {
    const parsed = parseReceipt({
      text: `Item Qty Amt
SPECIAL BREW 9.00 9.00
Sub Total 9.00
Total 9.00`,
      tokens: [],
    });

    const item = parsed.items.find((entry) => entry.name.value?.includes('SPECIAL BREW'));
    expect(item).toMatchObject({
      quantity: { value: 1 },
      unitPrice: { value: 900 },
      totalPrice: { value: 900 },
    });
  });

  it('trusts an independently-read rate over a corrupted total during cross-validation', () => {
    const parsed = parseReceipt({
      text: `Item Qty Rate Amt
COLD DRINK 3 2.00 6.01
Sub Total 6.01
Total 6.01`,
      tokens: [],
    });

    const item = parsed.items.find((entry) => entry.name.value?.includes('COLD DRINK'));
    expect(item).toMatchObject({
      quantity: { value: 3 },
      unitPrice: { value: 200, source: 'ocr' },
      totalPrice: { value: 601 },
    });
  });

  it('trusts an independently-read rate when the total looks 100x inflated by a dropped decimal', () => {
    const parsed = parseReceipt({
      text: `Item Qty Rate Amt
GARLIC BREAD 2 90.00 18000
Sub Total 180.00
Total 180.00`,
      tokens: [],
    });

    const item = parsed.items.find((entry) => entry.name.value?.includes('GARLIC BREAD'));
    expect(item).toMatchObject({
      quantity: { value: 2 },
      unitPrice: { value: 9000, source: 'ocr' },
      // The corrupted total is never silently rewritten, even once it's known
      // to be untrustworthy for deriving the unit price.
      totalPrice: { value: 1800000 },
    });
  });

  it('does not let a wrapped-line noise digit leak into the following row\'s quantity', () => {
    // A narrow receipt with real token geometry: "Special 9 Recipe" wraps the
    // name of the next row, and its embedded "9" sits nowhere near the amount
    // column. Idli/Vada establish that column so the check has something real
    // to align against.
    const tokens: OCRToken[] = [
      token('Item', 10, 10), token('Qty', 150, 10), token('Amt', 250, 10),
      token('Special', 10, 40), token('9', 150, 40), token('Recipe', 190, 40),
      token('Fried', 10, 70), token('Rice', 60, 70), token('2', 150, 70), token('180.00', 280, 70),
      token('Idli', 10, 100), token('3', 150, 100), token('90.00', 280, 100),
      token('Vada', 10, 130), token('4', 150, 130), token('120.00', 280, 130),
    ];
    const parsed = parseReceipt({ text: 'Item Qty Amt', tokens });

    const item = parsed.items.find((entry) => entry.name.value?.includes('Recipe'));
    expect(item).toMatchObject({
      quantity: { value: 2 },
      unitPrice: { value: 9000 },
      totalPrice: { value: 18000 },
    });
  });

  it('recovers a quantity printed on its own line, separate from the name and amount', () => {
    const tokens: OCRToken[] = [
      token('Item', 10, 10), token('Qty', 150, 10), token('Amt', 250, 10),
      token('Red', 10, 40), token('Cotta', 50, 40),
      token('1', 150, 70),
      token('Pizza', 10, 100), token('Mini', 60, 100),
      token('260.00', 280, 130),
      token('Idli', 10, 160), token('3', 150, 160), token('90.00', 280, 160),
      token('Vada', 10, 190), token('4', 150, 190), token('120.00', 280, 190),
    ];
    const parsed = parseReceipt({ text: 'Item Qty Amt', tokens });

    const item = parsed.items.find((entry) => entry.name.value === 'Red Cotta Pizza Mini');
    expect(item).toMatchObject({
      quantity: { value: 1 },
      unitPrice: { value: 26000, source: 'derived' },
      totalPrice: { value: 26000 },
    });
  });

  it('recovers a quantity, rate, and total each printed on their own line', () => {
    const tokens: OCRToken[] = [
      token('Item', 10, 10), token('Qty', 150, 10), token('Amt', 250, 10),
      token('Red', 10, 40), token('Cotta', 50, 40),
      token('1', 150, 70),
      token('Pizza', 10, 100), token('Mini', 60, 100),
      token('260.00', 280, 130), // rate, on its own line
      token('260.00', 280, 160), // total, immediately following
      token('Idli', 10, 190), token('3', 150, 190), token('90.00', 280, 190),
      token('Vada', 10, 220), token('4', 150, 220), token('120.00', 280, 220),
    ];
    const parsed = parseReceipt({ text: 'Item Qty Amt', tokens });

    const item = parsed.items.find((entry) => entry.name.value === 'Red Cotta Pizza Mini');
    expect(item).toMatchObject({
      quantity: { value: 1 },
      unitPrice: { value: 26000, source: 'ocr' },
      totalPrice: { value: 26000 },
    });
  });

  it('does not extract a number embedded in a name line as a quantity', () => {
    const tokens: OCRToken[] = [
      token('Item', 10, 10), token('Qty', 150, 10), token('Amt', 250, 10),
      token('CLASSICO', 10, 40), token('COLD', 90, 40), token('BREW', 140, 40), token('1', 190, 40),
      token('240.00', 280, 70),
      token('TEA', 10, 100), token('20.00', 280, 100),
      token('COFFEE', 10, 130), token('30.00', 280, 130),
    ];
    const parsed = parseReceipt({ text: 'Item Qty Amt', tokens });

    const item = parsed.items.find((entry) => entry.name.value === 'CLASSICO COLD BREW');
    expect(item).toMatchObject({
      quantity: { value: null },
      unitPrice: { value: null },
      totalPrice: { value: 24000 },
    });
  });
});
