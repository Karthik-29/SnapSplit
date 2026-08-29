import { describe, expect, it } from 'vitest';
import { calculateIndividualShares, distributeProportionally, splitSharedItemEvenly } from '../bill/splitting';
import { BillItem } from '../receipt/models';

const item: BillItem = { id: 'item-2', name: 'Chana Chaat', quantity: 1, unitPrice: 240, totalPrice: 240 };

describe('shared splitting', () => {
  it('splits evenly among participants', () => {
    const shares = splitSharedItemEvenly(item, ['user-1', 'user-2', 'user-3']);
    expect(shares).toEqual({ 'user-1': 80, 'user-2': 80, 'user-3': 80 });
  });

  it('splits a decimal price to the paisa and sums back exactly', () => {
    const decimalItem: BillItem = { id: 'i', name: 'Ceviche', quantity: 1, unitPrice: 16.95, totalPrice: 16.95 };
    const shares = splitSharedItemEvenly(decimalItem, ['user-1', 'user-2']);
    expect(shares).toEqual({ 'user-1': 8.48, 'user-2': 8.47 });
    const total = Number((shares['user-1'] + shares['user-2']).toFixed(2));
    expect(total).toBe(16.95);
  });
});

describe('individual shares', () => {
  it('keeps a decimal unit price exact rather than leaving a float tail', () => {
    const decimalItem: BillItem = { id: 'i', name: 'Ceviche', quantity: 3, unitPrice: 16.95, totalPrice: 50.85 };
    const shares = calculateIndividualShares(decimalItem, { 'user-1': 3 });
    expect(shares['user-1']).toBe(50.85);
  });
});

describe('distributeProportionally', () => {
  it('splits a pool by weight and sums back to the pool exactly', () => {
    const shares = distributeProportionally(60, { a: 260, b: 260, c: 80 }, ['a', 'b', 'c'], 600);
    expect(shares).toEqual({ a: 26, b: 26, c: 8 });
  });

  it('absorbs the rounding remainder on the last id', () => {
    const shares = distributeProportionally(100, { a: 100, b: 100, c: 100 }, ['a', 'b', 'c'], 300);
    const total = Number((shares.a + shares.b + shares.c).toFixed(2));
    expect(total).toBe(100);
    expect(shares.c).not.toBe(shares.a);
  });

  it('returns an empty map for a non-positive pool or zero total weight', () => {
    expect(distributeProportionally(0, { a: 1 }, ['a'], 1)).toEqual({});
    expect(distributeProportionally(10, { a: 1 }, ['a'], 0)).toEqual({});
  });
});
