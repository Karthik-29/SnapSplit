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
};

export type BillState = {
  receiptItems: BillItem[];
  receiptSubtotal?: number;
  receiptTotal?: number;
  participants: Participant[];
  itemClaims: ItemClaim[];
};
