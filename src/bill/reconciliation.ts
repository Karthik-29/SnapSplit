import { BillItem } from '../receipt/models';

export type ItemReconciliation = {
  itemSum: number;
  referenceLabel: 'subtotal' | 'total' | null;
  referenceValue: number | null;
  difference: number | null;
  status: 'match' | 'mismatch' | 'insufficient_data';
};

// ₹0.01 — BillItem values here are already major units, unlike the OCR
// pipeline's own minor-unit reconciliation.
const TOLERANCE = 0.01;

/**
 * Checks the sum of (possibly user-edited) bill items against the receipt's
 * own extracted subtotal or total.
 *
 * Subtotal is preferred over total when both are known: since downstream tax
 * is derived as `total - subtotal`, comparing items against total as well
 * would just be checking `items + tax ≈ total`, which reduces to the same
 * comparison once subtotal is already known — no separate tax-aware
 * arithmetic is needed here.
 */
export function checkItemsAgainstReceiptTotal(
  items: BillItem[],
  subtotal?: number,
  total?: number,
): ItemReconciliation {
  const itemSum = Number(items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
  const referenceLabel = subtotal !== undefined ? 'subtotal' : total !== undefined ? 'total' : null;
  const referenceValue = subtotal ?? total ?? null;

  if (referenceValue === null) {
    return { itemSum, referenceLabel, referenceValue, difference: null, status: 'insufficient_data' };
  }

  const difference = Number((itemSum - referenceValue).toFixed(2));
  return {
    itemSum,
    referenceLabel,
    referenceValue,
    difference,
    status: Math.abs(difference) <= TOLERANCE ? 'match' : 'mismatch',
  };
}
