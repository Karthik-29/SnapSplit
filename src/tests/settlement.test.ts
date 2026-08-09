import { describe, expect, it } from 'vitest';
import { calculateBillResults } from '../bill/settlement';
import { BillItem } from '../receipt/models';
import { ItemClaim } from '../bill/models';

const items: BillItem[] = [
  { id: 'item-1', name: 'Tofu Biryani', quantity: 2, unitPrice: 180, totalPrice: 360 },
  { id: 'item-2', name: 'Chana Chaat', quantity: 1, unitPrice: 240, totalPrice: 240 },
];

const participants = [
  { id: 'user-1', name: 'Karthik', paidAmount: 600 },
  { id: 'user-2', name: 'Rahul', paidAmount: 0 },
  { id: 'user-3', name: 'Amit', paidAmount: 0 },
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
      { participantId: 'user-1', name: 'Karthik', paid: 600, share: 260, net: 340 },
      { participantId: 'user-2', name: 'Rahul', paid: 0, share: 260, net: -260 },
      { participantId: 'user-3', name: 'Amit', paid: 0, share: 80, net: -80 },
    ]);
    expect(result.settlements).toEqual([
      { from: 'Amit', to: 'Karthik', amount: 80 },
      { from: 'Rahul', to: 'Karthik', amount: 260 },
    ]);
  });
});
