import { BillItem } from '../receipt/models';

export type Participant = {
  id: string;
  name: string;
  paidAmount: number;
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
  paid: number;
  share: number;
  net: number;
};

export type SettlementLine = {
  from: string;
  to: string;
  amount: number;
};

export type BillCalculationResult = {
  totalBill: number;
  participantSummaries: ParticipantSummary[];
  settlements: SettlementLine[];
};

export type BillState = {
  receiptItems: BillItem[];
  participants: Participant[];
  itemClaims: ItemClaim[];
};
