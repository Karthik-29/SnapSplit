import { describe, expect, it } from 'vitest';
import { calculateBillResults } from '../bill/settlement';
import { BillItem } from '../receipt/models';
import { ItemClaim } from '../bill/models';

const items: BillItem[] = [
  { id: 'item-1', name: 'Tofu Biryani', quantity: 2, unitPrice: 180, totalPrice: 360 },
  { id: 'item-2', name: 'Chana Chaat', quantity: 1, unitPrice: 240, totalPrice: 240 },
];

const participants = [
  { id: 'user-1', name: 'Karthik' },
  { id: 'user-2', name: 'Rahul' },
  { id: 'user-3', name: 'Amit' },
];

const itemClaims: ItemClaim[] = [
  {
    itemId: 'item-1',
    mode: 'individual',
    sharedWith: [],
    individualQuantities: { 'user-1': 1, 'user-2': 1, 'user-3': 0 },
  },
  {
    itemId: 'item-2',
    mode: 'shared',
    sharedWith: ['user-1', 'user-2', 'user-3'],
    individualQuantities: { 'user-1': 0, 'user-2': 0, 'user-3': 0 },
  },
];

describe('calculateBillResults', () => {
  it('calculates participant shares and settlements correctly', () => {
    const result = calculateBillResults(items, participants, itemClaims);

    expect(result.totalBill).toBe(600);
    expect(result.participantSummaries).toEqual([
      { participantId: 'user-1', name: 'Karthik', share: 260 },
      { participantId: 'user-2', name: 'Rahul', share: 260 },
      { participantId: 'user-3', name: 'Amit', share: 80 },
    ]);
    expect(result.settlements).toEqual([]);
  });
});
