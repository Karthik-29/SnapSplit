import { describe, expect, it } from 'vitest';
import { splitSharedItemEvenly } from '../bill/splitting';
import { BillItem } from '../receipt/models';

const item: BillItem = { id: 'item-2', name: 'Chana Chaat', quantity: 1, unitPrice: 240, totalPrice: 240 };

describe('shared splitting', () => {
  it('splits evenly among participants', () => {
    const shares = splitSharedItemEvenly(item, ['user-1', 'user-2', 'user-3']);
    expect(shares).toEqual({ 'user-1': 80, 'user-2': 80, 'user-3': 80 });
  });
});
