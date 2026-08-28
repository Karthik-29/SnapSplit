import { BillItem } from '../receipt/models';

export type Participant = {
  id: string;
  name: string;
};

export type ClaimMode = 'individual' | 'shared';

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
  participants: Participant[];
  itemClaims: ItemClaim[];
};
