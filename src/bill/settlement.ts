import { BillItem } from '../receipt/models';
import { BillCalculationResult, BillDiscount, ItemClaim, Participant, ParticipantSummary, SettlementLine } from './models';
import { getTotalClaimedQuantity } from './claims';
import { calculateIndividualShares, distributeProportionally, splitSharedItemEvenly } from './splitting';

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function normalizeParticipantMap<T>(participantIds: string[], defaultValue: T): Record<string, T> {
  return participantIds.reduce<Record<string, T>>((record, id) => {
    record[id] = defaultValue;
    return record;
  }, {});
}

export function calculateBillResults(
  items: BillItem[],
  participants: Participant[],
  itemClaims: ItemClaim[],
  receiptTotals?: { subtotal?: number; total?: number },
  discount?: BillDiscount
): BillCalculationResult {
  const participantIds = participants.map((participant) => participant.id);
  const shares = normalizeParticipantMap<number>(participantIds, 0);

  const itemMap = items.reduce<Record<string, BillItem>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const itemsNeedingReview: Array<{ id: string; name: string }> = [];

  for (const claim of itemClaims) {
    const item = itemMap[claim.itemId];
    if (!item) {
      continue;
    }

    if (claim.mode === 'shared' && claim.sharedWith.length > 0) {
      const split = splitSharedItemEvenly(item, claim.sharedWith);
      for (const participantId of Object.keys(split)) {
        shares[participantId] += split[participantId];
      }
    } else {
      // An item's quantity can be edited down in Review after claims already
      // exist. The stored claim is never rewritten for this — see
      // `capIndividualQuantities` — but the discrepancy must still be visible
      // somewhere, since a wrong-looking settlement number with no
      // explanation is worse than a flagged one.
      if (getTotalClaimedQuantity(claim) > item.quantity) {
        itemsNeedingReview.push({ id: item.id, name: item.name });
      }
      const individual = calculateIndividualShares(item, claim.individualQuantities);
      for (const [participantId, amount] of Object.entries(individual)) {
        shares[participantId] += amount;
      }
    }
  }

  const itemSubTotal = sum(items.map((item) => item.totalPrice));
  const receiptSubtotal = receiptTotals?.subtotal ?? itemSubTotal;
  const receiptTotal = receiptTotals?.total ?? itemSubTotal;
  const rawTax = receiptTotal - receiptSubtotal;
  const tax = rawTax > 0 ? Number(rawTax.toFixed(2)) : 0;

  const taxShares = distributeProportionally(tax, shares, participantIds, itemSubTotal);

  // The discount is a mirror of tax: resolve it to a rupee figure, then split it
  // by the same pre-tax item-share ratios so it nets out of `totalBill` exactly.
  // It is clamped to what participants collectively owe (base + tax) so no
  // individual share can be driven negative once the pool is distributed.
  const totalOwedBeforeDiscount = participantIds.reduce(
    (running, participantId) => running + (shares[participantId] ?? 0) + (taxShares[participantId] ?? 0),
    0
  );
  const preDiscountTotal = receiptTotal > 0 ? receiptTotal : itemSubTotal;
  const discountAmount = resolveDiscountAmount(discount, receiptSubtotal, totalOwedBeforeDiscount);
  const discountShares = distributeProportionally(discountAmount, shares, participantIds, itemSubTotal);

  const participantSummaries: ParticipantSummary[] = participants.map((participant) => {
    const baseShare = shares[participant.id] ?? 0;
    const taxShare = taxShares[participant.id] ?? 0;
    const discountShare = discountShares[participant.id] ?? 0;
    const share = Number((baseShare + taxShare - discountShare).toFixed(2));
    return {
      participantId: participant.id,
      name: participant.name,
      share,
    };
  });

  const totalBill = Number((preDiscountTotal - discountAmount).toFixed(2));

  return {
    totalBill,
    subtotal: receiptSubtotal,
    total: receiptTotal,
    tax,
    discount: discountAmount,
    participantSummaries,
    settlements: [],
    itemsNeedingReview,
  };
}

/**
 * Turns a `BillDiscount` into the rupee amount to actually take off the bill:
 * percentages resolve against the receipt subtotal, negatives are ignored, and
 * the result is capped at `maxDiscount` (what participants collectively owe) so
 * the bill can never go below zero.
 */
function resolveDiscountAmount(
  discount: BillDiscount | undefined,
  receiptSubtotal: number,
  maxDiscount: number
): number {
  if (!discount || discount.value <= 0) {
    return 0;
  }
  const requested = discount.type === 'percent'
    ? (discount.value / 100) * receiptSubtotal
    : discount.value;
  const clamped = Math.min(Math.max(requested, 0), Math.max(maxDiscount, 0));
  return Number(clamped.toFixed(2));
}
