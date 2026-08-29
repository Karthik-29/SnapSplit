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

  it('caps shares to the item total when a quantity was edited down after claims existed, without touching the stored claim', () => {
    // Item was originally quantity 4; two participants each individually
    // claimed 2 (total claimed 4). It was then edited down to quantity 2 in
    // Review. The stored claim still says 2 each — that must never be
    // silently rewritten — but the settlement math must still sum to exactly
    // the item's real total, per spec.md §19.
    const shrunkItems: BillItem[] = [{ id: 'item-1', name: 'Tofu Biryani', quantity: 2, unitPrice: 100, totalPrice: 200 }];
    const overClaim: ItemClaim[] = [
      {
        itemId: 'item-1',
        mode: 'individual',
        sharedWith: [],
        individualQuantities: { 'user-1': 2, 'user-2': 2, 'user-3': 0 },
      },
    ];

    const result = calculateBillResults(shrunkItems, participants, overClaim);

    const shareSum = Number(result.participantSummaries.reduce((sum, summary) => sum + summary.share, 0).toFixed(2));
    expect(shareSum).toBe(shrunkItems[0].totalPrice);

    expect(result.itemsNeedingReview).toEqual([{ id: 'item-1', name: 'Tofu Biryani' }]);

    // The stored claim itself is untouched — only the calculation view caps it.
    expect(overClaim[0].individualQuantities).toEqual({ 'user-1': 2, 'user-2': 2, 'user-3': 0 });
  });
});

describe('calculateBillResults with a bill discount', () => {
  // Base shares from `items`/`itemClaims` above: user-1 260, user-2 260, user-3 80 (subtotal 600).
  it('applies a flat discount proportionally and reduces the total bill', () => {
    const result = calculateBillResults(items, participants, itemClaims, undefined, { type: 'amount', value: 60 });

    expect(result.discount).toBe(60);
    expect(result.totalBill).toBe(540);
    expect(result.participantSummaries).toEqual([
      { participantId: 'user-1', name: 'Karthik', share: 234 },
      { participantId: 'user-2', name: 'Rahul', share: 234 },
      { participantId: 'user-3', name: 'Amit', share: 72 },
    ]);
  });

  it('resolves a percentage against the subtotal and keeps shares summing to the total', () => {
    const result = calculateBillResults(
      items,
      participants,
      itemClaims,
      { subtotal: 600, total: 660 },
      { type: 'percent', value: 10 },
    );

    expect(result.discount).toBe(60);
    // preDiscountTotal 660 (incl. ₹60 tax) − ₹60 discount = 600
    expect(result.totalBill).toBe(600);
    const shareSum = Number(result.participantSummaries.reduce((sum, s) => sum + s.share, 0).toFixed(2));
    expect(shareSum).toBe(result.totalBill);
  });

  it('caps a discount larger than what participants owe and never goes negative', () => {
    const result = calculateBillResults(items, participants, itemClaims, undefined, { type: 'amount', value: 5000 });

    expect(result.discount).toBe(600);
    expect(result.totalBill).toBe(0);
    for (const summary of result.participantSummaries) {
      expect(summary.share).toBeGreaterThanOrEqual(0);
    }
    const shareSum = Number(result.participantSummaries.reduce((sum, s) => sum + s.share, 0).toFixed(2));
    expect(shareSum).toBe(0);
  });

  it('distributes a discount with a rounding remainder so shares still sum exactly', () => {
    const result = calculateBillResults(items, participants, itemClaims, undefined, { type: 'amount', value: 100 });

    const shareSum = Number(result.participantSummaries.reduce((sum, s) => sum + s.share, 0).toFixed(2));
    expect(shareSum).toBe(result.totalBill);
    expect(result.totalBill).toBe(500);
  });

  it('leaves the calculation unchanged when there is no discount', () => {
    const withUndefined = calculateBillResults(items, participants, itemClaims);
    const withZero = calculateBillResults(items, participants, itemClaims, undefined, { type: 'amount', value: 0 });

    expect(withUndefined.totalBill).toBe(600);
    expect(withUndefined.discount).toBe(0);
    expect(withZero.receiptDiscount).toBe(0);
    expect(withZero.participantSummaries).toEqual(withUndefined.participantSummaries);
  });
});

describe('calculateBillResults with a receipt discount (already printed on the bill)', () => {
  // Base shares from `items`/`itemClaims`: user-1 260, user-2 260, user-3 80 (subtotal 600).
  it('adds the receipt discount back before deriving tax, then nets it out of the total', () => {
    // Receipt: subtotal 600, discount -60, tax 90, grand total 630.
    const result = calculateBillResults(
      items,
      participants,
      itemClaims,
      { subtotal: 600, total: 630, discount: { type: 'amount', value: 60 } },
    );

    expect(result.tax).toBe(90); // (630 + 60) − 600, not clamped to 0
    expect(result.receiptDiscount).toBe(60);
    expect(result.discount).toBe(60);
    expect(result.totalBill).toBe(630); // matches the printed grand total
    expect(result.participantSummaries).toEqual([
      { participantId: 'user-1', name: 'Karthik', share: 273 },
      { participantId: 'user-2', name: 'Rahul', share: 273 },
      { participantId: 'user-3', name: 'Amit', share: 84 },
    ]);
    const shareSum = Number(result.participantSummaries.reduce((sum, s) => sum + s.share, 0).toFixed(2));
    expect(shareSum).toBe(result.totalBill);
  });

  it('resolves a percentage receipt discount against the subtotal', () => {
    const flat = calculateBillResults(items, participants, itemClaims, {
      subtotal: 600,
      total: 630,
      discount: { type: 'amount', value: 60 },
    });
    const percent = calculateBillResults(items, participants, itemClaims, {
      subtotal: 600,
      total: 630,
      discount: { type: 'percent', value: 10 },
    });

    expect(percent.receiptDiscount).toBe(60);
    expect(percent.participantSummaries).toEqual(flat.participantSummaries);
  });

  it('stacks a group discount on top of the receipt discount', () => {
    // Receipt discount 60 (already in the 630 total) + group takes off a further 30.
    const result = calculateBillResults(
      items,
      participants,
      itemClaims,
      { subtotal: 600, total: 630, discount: { type: 'amount', value: 60 } },
      { type: 'amount', value: 30 },
    );

    expect(result.receiptDiscount).toBe(60);
    expect(result.discount).toBe(90); // 60 receipt + 30 group
    expect(result.totalBill).toBe(600); // 630 printed − 30 group discount
    const shareSum = Number(result.participantSummaries.reduce((sum, s) => sum + s.share, 0).toFixed(2));
    expect(shareSum).toBe(result.totalBill);
  });

  it('clamps a percentage receipt discount at 100%', () => {
    // subtotal 1000, no tax, discount is a bogus 150% → treated as 100% (1000).
    const oneItem: BillItem[] = [{ id: 'item-1', name: 'Platter', quantity: 1, unitPrice: 1000, totalPrice: 1000 }];
    const claim: ItemClaim[] = [
      { itemId: 'item-1', mode: 'shared', sharedWith: ['user-1', 'user-2'], individualQuantities: {} },
    ];
    const result = calculateBillResults(oneItem, participants.slice(0, 2), claim, {
      subtotal: 1000,
      total: 0,
      discount: { type: 'percent', value: 150 },
    });

    expect(result.receiptDiscount).toBe(1000); // 100% of 1000, not 150%
    expect(result.totalBill).toBe(0);
    for (const summary of result.participantSummaries) {
      expect(summary.share).toBeGreaterThanOrEqual(0);
    }
  });
});
