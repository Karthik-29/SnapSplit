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
   * percentage and clamping to what participants collectively owe. Includes both
   * the receipt discount and the group discount. `totalBill` is already net of
   * this amount.
   */
  discount?: number;
  /**
   * The portion of `discount` that came from the receipt's own printed discount
   * (resolved to a rupee figure). Exposed so review checks can reason about the
   * printed total being legitimately below the subtotal.
   */
  receiptDiscount?: number;
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
  /**
   * A discount already printed on the receipt and baked into `receiptTotal`
   * (e.g. a "Discount -100" line above the grand total, or "10% off"). Same
   * shape as `discount` — a flat `amount` or a `percent` of the subtotal — but
   * kept separate because the two need opposite treatment in the tax
   * derivation: the receipt discount is added back when computing
   * `total - subtotal` tax, the group one is not.
   */
  receiptDiscount?: BillDiscount;
  discount?: BillDiscount;
  participants: Participant[];
  itemClaims: ItemClaim[];
};
