import { describe, expect, it } from 'vitest';
import { checkItemsAgainstReceiptTotal } from '../bill/reconciliation';
import { BillItem } from '../receipt/models';

const items: BillItem[] = [
  { id: 'item-1', name: 'Tofu Biryani', quantity: 2, unitPrice: 180, totalPrice: 360 },
  { id: 'item-2', name: 'Chana Chaat', quantity: 1, unitPrice: 240, totalPrice: 240 },
];

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
});
