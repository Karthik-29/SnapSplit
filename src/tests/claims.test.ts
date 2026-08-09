import { describe, expect, it } from 'vitest';
import { buildDefaultClaim, getTotalClaimedQuantity, isClaimValid } from '../bill/claims';
import { BillItem } from '../receipt/models';

const item: BillItem = { id: 'item-1', name: 'Lime Soda', quantity: 2, unitPrice: 80, totalPrice: 160 };

describe('claims validation', () => {
  it('builds a default empty claim for participants', () => {
    const claim = buildDefaultClaim(item, ['user-1', 'user-2']);
    expect(claim.individualQuantities).toEqual({ 'user-1': 0, 'user-2': 0 });
  });

  it('validates a correct claim quantity', () => {
    const claim = buildDefaultClaim(item, ['user-1', 'user-2']);
    claim.individualQuantities['user-1'] = 1;
    claim.individualQuantities['user-2'] = 1;
    expect(getTotalClaimedQuantity(claim)).toBe(2);
    expect(isClaimValid(item, claim)).toBe(true);
  });

  it('rejects an overclaimed item', () => {
    const claim = buildDefaultClaim(item, ['user-1', 'user-2', 'user-3']);
    claim.individualQuantities['user-1'] = 1;
    claim.individualQuantities['user-2'] = 1;
    claim.individualQuantities['user-3'] = 1;
    expect(getTotalClaimedQuantity(claim)).toBe(3);
    expect(isClaimValid(item, claim)).toBe(false);
  });
});
