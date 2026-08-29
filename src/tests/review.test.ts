import { describe, expect, it } from 'vitest';
import { runReviewChecks } from '../bill/review';
import { BillCalculationResult } from '../bill/models';
import { BillItem } from '../receipt/models';

const items: BillItem[] = [
  { id: 'item-1', name: 'Tofu Biryani', quantity: 2, unitPrice: 180, totalPrice: 360 },
  { id: 'item-2', name: 'Chana Chaat', quantity: 1, unitPrice: 240, totalPrice: 240 },
];

const cleanResult: BillCalculationResult = {
  totalBill: 600,
  subtotal: 600,
  total: 600,
  tax: 0,
  discount: 0,
  participantSummaries: [
    { participantId: 'user-1', name: 'Karthik', share: 260 },
    { participantId: 'user-2', name: 'Rahul', share: 260 },
    { participantId: 'user-3', name: 'Amit', share: 80 },
  ],
  settlements: [],
  itemsNeedingReview: [],
};

const statusFor = (checks: ReturnType<typeof runReviewChecks>, id: string) =>
  checks.find((check) => check.id === id)?.status;

describe('runReviewChecks', () => {
  it('passes every check for a clean, balanced bill', () => {
    const checks = runReviewChecks({
      result: cleanResult,
      items,
      receiptSubtotal: 600,
      receiptTotal: 600,
      participantCount: 3,
    });

    expect(checks.every((check) => check.status === 'pass')).toBe(true);
  });

  it('fails when participant shares do not sum to the total bill', () => {
    const result = { ...cleanResult, totalBill: 700 };
    const checks = runReviewChecks({ result, items, receiptSubtotal: 600, receiptTotal: 600, participantCount: 3 });
    expect(statusFor(checks, 'shares-add-up')).toBe('fail');
  });

  it('fails on a negative participant share', () => {
    const result: BillCalculationResult = {
      ...cleanResult,
      totalBill: 520,
      participantSummaries: [
        { participantId: 'user-1', name: 'Karthik', share: 300 },
        { participantId: 'user-2', name: 'Rahul', share: 240 },
        { participantId: 'user-3', name: 'Amit', share: -20 },
      ],
    };
    const checks = runReviewChecks({ result, items, receiptSubtotal: 600, receiptTotal: 600, participantCount: 3 });
    expect(statusFor(checks, 'no-negative-shares')).toBe('fail');
  });

  it('fails when there are no participants', () => {
    const checks = runReviewChecks({ result: cleanResult, items, participantCount: 0 });
    expect(statusFor(checks, 'has-participants')).toBe('fail');
  });

  it('warns when the requested discount could not be applied in full', () => {
    const result = { ...cleanResult, totalBill: 0, discount: 600 };
    const checks = runReviewChecks({
      result,
      items,
      receiptSubtotal: 600,
      receiptTotal: 600,
      discount: { type: 'amount', value: 5000 },
      participantCount: 3,
    });
    expect(statusFor(checks, 'discount-in-full')).toBe('warn');
  });

  it('passes the discount check when the full amount was applied', () => {
    const result = { ...cleanResult, totalBill: 540, discount: 60 };
    const checks = runReviewChecks({
      result,
      items,
      receiptSubtotal: 600,
      receiptTotal: 600,
      discount: { type: 'amount', value: 60 },
      participantCount: 3,
    });
    expect(statusFor(checks, 'discount-in-full')).toBe('pass');
  });

  it('omits the discount check when no discount is set', () => {
    const checks = runReviewChecks({ result: cleanResult, items, receiptSubtotal: 600, receiptTotal: 600, participantCount: 3 });
    expect(checks.some((check) => check.id === 'discount-in-full')).toBe(false);
  });

  it('warns when item prices do not match the receipt subtotal', () => {
    const checks = runReviewChecks({
      result: cleanResult,
      items,
      receiptSubtotal: 900,
      receiptTotal: 900,
      participantCount: 3,
    });
    expect(statusFor(checks, 'items-match-receipt')).toBe('warn');
  });

  it('warns when an item is over-claimed', () => {
    const result = { ...cleanResult, itemsNeedingReview: [{ id: 'item-1', name: 'Tofu Biryani' }] };
    const checks = runReviewChecks({ result, items, receiptSubtotal: 600, receiptTotal: 600, participantCount: 3 });
    expect(statusFor(checks, 'no-over-claimed-items')).toBe('warn');
  });
});
