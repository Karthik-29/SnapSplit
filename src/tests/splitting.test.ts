import { describe, expect, it } from 'vitest';
import { distributeProportionally, splitSharedItemEvenly } from '../bill/splitting';
import { BillItem } from '../receipt/models';

const item: BillItem = { id: 'item-2', name: 'Chana Chaat', quantity: 1, unitPrice: 240, totalPrice: 240 };

describe('shared splitting', () => {
  it('splits evenly among participants', () => {
    const shares = splitSharedItemEvenly(item, ['user-1', 'user-2', 'user-3']);
    expect(shares).toEqual({ 'user-1': 80, 'user-2': 80, 'user-3': 80 });
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
