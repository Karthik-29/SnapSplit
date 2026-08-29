import { BillItem } from '../receipt/models';

export type Participant = {
  id: string;
  name: string;
};

export type ClaimMode = 'individual' | 'shared';

/**
 * A discount applied to the whole bill. `amount` is a flat value in major
 * currency units; `percent` is a percentage (0–100) taken off the receipt
 * subtotal. Either way it is distributed across participants in proportion to
 * their pre-discount share — the mirror image of how tax is allocated.
 */
export type BillDiscount = {
  type: 'amount' | 'percent';
  value: number;
};

export type ItemClaim = {
  itemId: string;
  mode: ClaimMode;
  sharedWith: string[];
  individualQuantities: Record<string, number>;
};

export type ParticipantSummary = {
  participantId: string;
  name: string;
  share: number;
};

export type SettlementLine = {
  from: string;
  to: string;
  amount: number;
};

export type BillCalculationResult = {
  totalBill: number;
  subtotal?: number;
  total?: number;
  tax?: number;
  /**
   * The discount actually applied, in major currency units, after resolving a
   * percentage and clamping to what participants collectively owe. `totalBill`
   * is already net of this amount.
   */
  discount?: number;
  participantSummaries: ParticipantSummary[];
  settlements: SettlementLine[];
  /**
   * Items whose claimed quantity exceeded the item's own quantity at
   * calculation time. Shares for these items are still capped to the item's
   * real quantity (so participant shares always sum to the bill total), but
   * the stored claim itself is never silently rewritten — this list is how
   * the UI tells the user to go fix the claim at the source.
   */
  itemsNeedingReview: Array<{ id: string; name: string }>;
};

export type BillState = {
  receiptItems: BillItem[];
  receiptSubtotal?: number;
  receiptTotal?: number;
  discount?: BillDiscount;
  participants: Participant[];
  itemClaims: ItemClaim[];
};
