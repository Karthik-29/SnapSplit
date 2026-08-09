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

export function calculateIndividualShares(item: BillItem, claimQuantities: Record<string, number>): Record<string, number> {
  const unitPrice = item.unitPrice;
  return Object.entries(claimQuantities).reduce<Record<string, number>>((shares, [participantId, quantity]) => {
    shares[participantId] = quantity * unitPrice;
    return shares;
  }, {});
}
