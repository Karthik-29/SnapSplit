import { BillItem } from '../receipt/models';

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function splitSharedItemEvenly(item: BillItem, participantIds: string[]): Record<string, number> {
  const participantCount = participantIds.length;
  if (participantCount === 0) {
    return {};
  }

  // Work in integer paise/cents so a decimal price (e.g. ₹16.95) splits
  // exactly: everyone gets the floor, and the leftover paise are handed out
  // one each to the earliest participants so the parts sum back to the price.
  const totalCents = Math.round(item.totalPrice * 100);
  const baseCents = Math.floor(totalCents / participantCount);
  const remainderCents = totalCents - baseCents * participantCount;

  return participantIds.reduce<Record<string, number>>((shares, id, index) => {
    shares[id] = (baseCents + (index < remainderCents ? 1 : 0)) / 100;
    return shares;
  }, {});
}

/**
 * Scales claimed quantities down to fit the item's real quantity when they no
 * longer do — e.g. the item's quantity was edited down in Review after claims
 * already existed. This is a calculation-time view only: the caller's
 * `claimQuantities` object (and the `ItemClaim` it came from) is never
 * mutated, so nobody's recorded claim silently changes behind their back.
 * Uses the same base-share-plus-remainder rule as `splitSharedItemEvenly` so
 * the scaled quantities sum exactly to `item.quantity`.
 */
export function capIndividualQuantities(item: BillItem, claimQuantities: Record<string, number>): Record<string, number> {
  const entries = Object.entries(claimQuantities);
  const totalClaimed = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  if (totalClaimed <= item.quantity) return claimQuantities;

  const scale = item.quantity / totalClaimed;
  const scaled = entries.map(([participantId, quantity]) => [participantId, Math.floor(quantity * scale)] as const);
  const remainder = item.quantity - scaled.reduce((sum, [, quantity]) => sum + quantity, 0);

  return scaled.reduce<Record<string, number>>((result, [participantId, quantity], index) => {
    result[participantId] = quantity + (index < remainder ? 1 : 0);
    return result;
  }, {});
}

/**
 * Splits `pool` across `orderedIds` in proportion to each id's weight, rounding
 * every share to 2 decimal places and pushing the leftover rounding remainder
 * onto the last id so the parts sum back to `pool` exactly. Used for both the
 * proportional tax and the proportional discount in `calculateBillResults`.
 *
 * `totalWeight` is passed explicitly (rather than summed from `weightById`)
 * because tax/discount are allocated against the item subtotal, which is not
 * necessarily the sum of the per-participant shares.
 */
export function distributeProportionally(
  pool: number,
  weightById: Record<string, number>,
  orderedIds: string[],
  totalWeight: number,
): Record<string, number> {
  const distributed: Record<string, number> = {};
  if (pool <= 0 || totalWeight <= 0 || orderedIds.length === 0) {
    return distributed;
  }

  let allocated = 0;
  orderedIds.forEach((id) => {
    const ratio = (weightById[id] ?? 0) / totalWeight;
    const share = Number((ratio * pool).toFixed(2));
    distributed[id] = share;
    allocated += share;
  });

  const remainder = Math.round((pool - allocated) * 100) / 100;
  if (remainder !== 0) {
    const lastId = orderedIds[orderedIds.length - 1];
    distributed[lastId] = Number(((distributed[lastId] ?? 0) + remainder).toFixed(2));
  }

  return distributed;
}

export function calculateIndividualShares(item: BillItem, claimQuantities: Record<string, number>): Record<string, number> {
  // Multiply in integer paise/cents so a decimal unit price doesn't leave a
  // float tail (e.g. 3 × 16.95 landing on 50.849999…).
  const unitPriceCents = Math.round(item.unitPrice * 100);
  const cappedQuantities = capIndividualQuantities(item, claimQuantities);
  return Object.entries(cappedQuantities).reduce<Record<string, number>>((shares, [participantId, quantity]) => {
    shares[participantId] = (quantity * unitPriceCents) / 100;
    return shares;
  }, {});
}
