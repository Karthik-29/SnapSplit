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
  itemClaims: ItemClaim[]
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

  const participantSummaries: ParticipantSummary[] = participants.map((participant) => {
    const share = shares[participant.id] ?? 0;
    const net = Math.round(participant.paidAmount - share);
    return {
      participantId: participant.id,
      name: participant.name,
      paid: participant.paidAmount,
      share,
      net,
    };
  });

  const totalBill = sum(items.map((item) => item.totalPrice));

  const creditors = participantSummaries
    .filter((summary) => summary.net > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const debtors = participantSummaries
    .filter((summary) => summary.net < 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const settlements: SettlementLine[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.net, -debtor.net);
    settlements.push({ from: debtor.name, to: creditor.name, amount });

    creditors[creditorIndex] = { ...creditor, net: creditor.net - amount };
    debtors[debtorIndex] = { ...debtor, net: debtor.net + amount };

    if (creditors[creditorIndex].net === 0) {
      creditorIndex += 1;
    }
    if (debtors[debtorIndex].net === 0) {
      debtorIndex += 1;
    }
  }

  return {
    totalBill,
    participantSummaries,
    settlements,
  };
}
