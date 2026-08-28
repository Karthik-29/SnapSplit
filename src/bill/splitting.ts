import { BillItem } from '../receipt/models';

export function roundToCents(value: number): number {
  return Math.round(value);
}

export function splitSharedItemEvenly(item: BillItem, participantIds: string[]): Record<string, number> {
  const participantCount = participantIds.length;
  if (participantCount === 0) {
    return {};
  }

  const baseShare = Math.floor(item.totalPrice / participantCount);
  const remainder = item.totalPrice - baseShare * participantCount;

  return participantIds.reduce<Record<string, number>>((shares, id, index) => {
    shares[id] = baseShare + (index < remainder ? 1 : 0);
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

export function calculateIndividualShares(item: BillItem, claimQuantities: Record<string, number>): Record<string, number> {
  const unitPrice = item.unitPrice;
  const cappedQuantities = capIndividualQuantities(item, claimQuantities);
  return Object.entries(cappedQuantities).reduce<Record<string, number>>((shares, [participantId, quantity]) => {
    shares[participantId] = quantity * unitPrice;
    return shares;
  }, {});
}
