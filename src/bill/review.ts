import { BillItem } from '../receipt/models';
import { BillCalculationResult, BillDiscount } from './models';
import { checkItemsAgainstReceiptTotal } from './reconciliation';

export type ReviewCheckStatus = 'pass' | 'warn' | 'fail';

export type ReviewCheck = {
  id: string;
  label: string;
  status: ReviewCheckStatus;
  detail?: string;
};

// Same ₹0.01 slack the reconciliation check uses — values here are already in
// major units and every step rounds to 2dp, so anything larger is a real bug.
const TOLERANCE = 0.01;

/**
 * Runs a set of arithmetic sanity checks over a finished bill calculation for
 * display on the Settlement ("final review") screen. Pure: it never mutates its
 * input and returns one `ReviewCheck` per invariant so the UI can render a
 * pass/warn/fail list.
 *
 * `fail` means the numbers genuinely don't add up (shares that don't sum to the
 * total, a negative share, no participants). `warn` means the split still adds
 * up but something upstream is worth a second look (items not matching the
 * receipt, an over-claimed item, a discount that had to be capped).
 */
export function runReviewChecks(input: {
  result: BillCalculationResult;
  items: BillItem[];
  receiptSubtotal?: number;
  receiptTotal?: number;
  receiptDiscount?: BillDiscount;
  discount?: BillDiscount;
  participantCount: number;
}): ReviewCheck[] {
  const { result, items, receiptSubtotal, receiptTotal, receiptDiscount, discount, participantCount } = input;
  const subtotalForPercent = receiptSubtotal ?? result.subtotal ?? 0;
  const appliedReceiptDiscount = result.receiptDiscount ?? 0;
  const checks: ReviewCheck[] = [];

  const shareSum = Number(
    result.participantSummaries.reduce((running, summary) => running + summary.share, 0).toFixed(2)
  );
  const shareGap = Number((shareSum - result.totalBill).toFixed(2));
  checks.push({
    id: 'shares-add-up',
    label: 'Participant shares add up to the total bill',
    status: Math.abs(shareGap) <= TOLERANCE ? 'pass' : 'fail',
    detail:
      Math.abs(shareGap) <= TOLERANCE
        ? undefined
        : `Shares sum to ₹${shareSum.toFixed(2)} but the total bill is ₹${result.totalBill.toFixed(2)} (off by ₹${Math.abs(shareGap).toFixed(2)}).`,
  });

  const negative = result.participantSummaries.filter((summary) => summary.share < -TOLERANCE);
  checks.push({
    id: 'no-negative-shares',
    label: 'No participant owes a negative amount',
    status: negative.length === 0 ? 'pass' : 'fail',
    detail:
      negative.length === 0
        ? undefined
        : `Negative share for ${negative.map((summary) => summary.name).join(', ')}.`,
  });

  checks.push({
    id: 'has-participants',
    label: 'The bill has at least one participant',
    status: participantCount > 0 ? 'pass' : 'fail',
    detail: participantCount > 0 ? undefined : 'Add participants before settling.',
  });

  if (receiptDiscount && receiptDiscount.value > 0) {
    const requested =
      receiptDiscount.type === 'percent'
        ? (Math.min(receiptDiscount.value, 100) / 100) * subtotalForPercent
        : receiptDiscount.value;
    const capped = requested - appliedReceiptDiscount > TOLERANCE;
    checks.push({
      id: 'receipt-discount-in-full',
      label: 'The receipt discount was applied in full',
      status: capped ? 'warn' : 'pass',
      detail: capped
        ? `The receipt discount resolves to ₹${requested.toFixed(2)} but only ₹${appliedReceiptDiscount.toFixed(2)} could be applied — it exceeds what participants owe, so check the receipt discount value.`
        : undefined,
    });
  }

  if (discount && discount.value > 0) {
    const requested =
      discount.type === 'percent'
        ? (discount.value / 100) * subtotalForPercent
        : discount.value;
    const applied = Number(((result.discount ?? 0) - appliedReceiptDiscount).toFixed(2));
    const capped = requested - applied > TOLERANCE;
    checks.push({
      id: 'discount-in-full',
      label: 'The discount was applied in full',
      status: capped ? 'warn' : 'pass',
      detail: capped
        ? `Requested ₹${requested.toFixed(2)} but only ₹${applied.toFixed(2)} could be applied — the discount was capped at the amount owed.`
        : undefined,
    });
  }

  const reconciliation = checkItemsAgainstReceiptTotal(items, receiptSubtotal, receiptTotal, appliedReceiptDiscount);
  const reconciliationOk =
    reconciliation.status !== 'mismatch' && !reconciliation.totalBelowSubtotal;
  checks.push({
    id: 'items-match-receipt',
    label: 'Item prices match the receipt',
    status: reconciliationOk ? 'pass' : 'warn',
    detail: reconciliation.totalBelowSubtotal
      ? 'Receipt total is below the receipt subtotal — one of them was likely misread.'
      : reconciliation.status === 'mismatch'
        ? `Items total ₹${reconciliation.itemSum.toFixed(2)} differs from the receipt ${reconciliation.referenceLabel} (₹${(reconciliation.referenceValue ?? 0).toFixed(2)}).`
        : undefined,
  });

  checks.push({
    id: 'no-over-claimed-items',
    label: 'No item is claimed more than it exists',
    status: result.itemsNeedingReview.length === 0 ? 'pass' : 'warn',
    detail:
      result.itemsNeedingReview.length === 0
        ? undefined
        : `Over-claimed: ${result.itemsNeedingReview.map((item) => item.name).join(', ')}. Shares are capped so they still add up, but fix the claim in Item Claims.`,
  });

  return checks;
}
