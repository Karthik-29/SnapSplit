import { BillItem } from '../receipt/models';
import { ItemClaim } from './models';

export function getClaimedQuantity(claim: ItemClaim, participantId: string): number {
  return claim.individualQuantities[participantId] ?? 0;
}

export function getTotalClaimedQuantity(claim: ItemClaim): number {
  return Object.values(claim.individualQuantities).reduce((sum, value) => sum + value, 0);
}

export function getRemainingQuantity(item: BillItem, claim: ItemClaim): number {
  return Math.max(0, item.quantity - getTotalClaimedQuantity(claim));
}

export function isClaimValid(item: BillItem, claim: ItemClaim): boolean {
  const claimed = getTotalClaimedQuantity(claim);
  return claimed <= item.quantity;
}

export function buildDefaultClaim(item: BillItem, participantIds: string[]): ItemClaim {
  return {
    itemId: item.id,
    mode: 'individual',
    sharedWith: [],
    individualQuantities: participantIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = 0;
      return acc;
    }, {}),
  };
}
