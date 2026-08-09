import { describe, expect, it } from 'vitest';
import { parseReceiptLines } from '../receipt/parser';
import { OCRResult } from '../receipt/models';

describe('parseReceiptLines', () => {
  it('parses receipt lines into bill items and ignores summary labels', () => {
    const input: OCRResult = {
      text: `Tofu Biryani     2     360
Masala Dosa      1     180
Chana Chaat      1     220
Lime Soda        2     160
Subtotal         920
Tax              20
Total            940`,
      tokens: [],
    };

    const items = parseReceiptLines(input);

    expect(items).toEqual([
      { id: 'item-1', name: 'Tofu Biryani', quantity: 2, unitPrice: 180, totalPrice: 360 },
      { id: 'item-2', name: 'Masala Dosa', quantity: 1, unitPrice: 180, totalPrice: 180 },
      { id: 'item-3', name: 'Chana Chaat', quantity: 1, unitPrice: 220, totalPrice: 220 },
      { id: 'item-4', name: 'Lime Soda', quantity: 2, unitPrice: 80, totalPrice: 160 },
    ]);
  });
});
