import { BillItem } from '../receipt/models';
import { BillCalculationResult, ItemClaim, Participant, ParticipantSummary, SettlementLine } from './models';
import { calculateIndividualShares, splitSharedItemEvenly } from './splitting';

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function normalizeParticipantMap<T>(participantIds: string[], defaultValue: T): Record<string, T> {
  return participantIds.reduce<Record<string, T>>((record, id) => {
    record[id] = defaultValue;
    return record;
  }, {});
}

export function calculateBillResults(
  items: BillItem[],
  participants: Participant[],
  itemClaims: ItemClaim[],
  receiptTotals?: { subtotal?: number; total?: number }
): BillCalculationResult {
  const participantIds = participants.map((participant) => participant.id);
  const shares = normalizeParticipantMap<number>(participantIds, 0);

  const itemMap = items.reduce<Record<string, BillItem>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  for (const claim of itemClaims) {
    const item = itemMap[claim.itemId];
    if (!item) {
      continue;
    }

    if (claim.mode === 'shared' && claim.sharedWith.length > 0) {
      const split = splitSharedItemEvenly(item, claim.sharedWith);
      for (const participantId of Object.keys(split)) {
        shares[participantId] += split[participantId];
      }
    } else {
      const individual = calculateIndividualShares(item, claim.individualQuantities);
      for (const [participantId, amount] of Object.entries(individual)) {
        shares[participantId] += amount;
      }
    }
  }

  const itemSubTotal = sum(items.map((item) => item.totalPrice));
  const receiptSubtotal = receiptTotals?.subtotal ?? itemSubTotal;
  const receiptTotal = receiptTotals?.total ?? itemSubTotal;
  const rawTax = receiptTotal - receiptSubtotal;
  const tax = rawTax > 0 ? Number(rawTax.toFixed(2)) : 0;

  const taxShares: Record<string, number> = {};
  if (tax > 0 && itemSubTotal > 0) {
    let allocatedTax = 0;
    participantIds.forEach((participantId) => {
      const participantShare = shares[participantId] ?? 0;
      const ratio = itemSubTotal > 0 ? participantShare / itemSubTotal : 0;
      const shareTax = Number((ratio * tax).toFixed(2));
      taxShares[participantId] = shareTax;
      allocatedTax += shareTax;
    });

    const remainder = Math.round((tax - allocatedTax) * 100) / 100;
    if (remainder !== 0) {
      const lastId = participantIds[participantIds.length - 1];
      taxShares[lastId] = Number(((taxShares[lastId] ?? 0) + remainder).toFixed(2));
    }
  }

  const participantSummaries: ParticipantSummary[] = participants.map((participant) => {
    const baseShare = shares[participant.id] ?? 0;
    const taxShare = taxShares[participant.id] ?? 0;
    const share = Number((baseShare + taxShare).toFixed(2));
    return {
      participantId: participant.id,
      name: participant.name,
      share,
    };
  });

  const totalBill = receiptTotal > 0 ? receiptTotal : itemSubTotal;

  return {
    totalBill,
    subtotal: receiptSubtotal,
    total: receiptTotal,
    tax,
    participantSummaries,
    settlements: [],
  };
}
