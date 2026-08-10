import React, { createContext, useContext, useMemo, useState } from 'react';
import { BillItem } from '../receipt/models';
import { buildDefaultClaim } from '../bill/claims';
import { calculateBillResults } from '../bill/settlement';
import { BillState, ItemClaim, Participant } from '../bill/models';

export type AppContextValue = {
  state: BillState;
  addParticipant: (name: string, id?: string) => void;
  removeParticipant: (participantId: string) => void;
  setParticipants: (participants: Participant[]) => void;
  restoreState: (state: Pick<BillState, 'receiptItems' | 'receiptSubtotal' | 'receiptTotal' | 'participants' | 'itemClaims'>) => void;
  updateBillItem: (item: BillItem) => void;
  setBillItems: (items: BillItem[], receiptTotals?: { subtotal?: number; total?: number }) => void;
  addBillItem: () => void;
  removeBillItem: (itemId: string) => void;
  updateItemClaim: (claim: ItemClaim) => void;
  calculationResult: ReturnType<typeof calculateBillResults>;
};

const initialItems: BillItem[] = [];

const defaultParticipants: Participant[] = [];

const initialClaims: ItemClaim[] = [];

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<BillItem[]>(initialItems);
  const [participants, setParticipantsState] = useState<Participant[]>(defaultParticipants);
  const [itemClaims, setItemClaims] = useState<ItemClaim[]>(initialClaims);
  const [receiptSubtotal, setReceiptSubtotal] = useState<number | undefined>(undefined);
  const [receiptTotal, setReceiptTotal] = useState<number | undefined>(undefined);

  const addParticipant = (name: string, idOverride?: string) => {
    const id = idOverride ?? `user-${Date.now()}`;
    const nextParticipants = participants.some((participant) => participant.id === id)
      ? participants
      : [...participants, { id, name }];

    setParticipantsState(nextParticipants);
    setItemClaims((claims) => claims.map((claim) => ({
      ...claim,
      individualQuantities: { ...claim.individualQuantities, [id]: 0 },
    })));
  };

  const setParticipants = (nextParticipants: Participant[]) => {
    setParticipantsState(nextParticipants);
    setItemClaims((claims) =>
      claims.map((claim) => ({
        ...claim,
        individualQuantities: Object.fromEntries(
          Object.entries(claim.individualQuantities).filter(([key]) => nextParticipants.some((participant) => participant.id === key))
        ),
        sharedWith: claim.sharedWith.filter((id) => nextParticipants.some((participant) => participant.id === id)),
      }))
    );
  };

  const restoreState = (nextState: Pick<BillState, 'receiptItems' | 'receiptSubtotal' | 'receiptTotal' | 'participants' | 'itemClaims'>) => {
    setItems(nextState.receiptItems);
    setReceiptSubtotal(nextState.receiptSubtotal);
    setReceiptTotal(nextState.receiptTotal);
    setParticipantsState(nextState.participants);
    setItemClaims(nextState.itemClaims);
  };

  const removeParticipant = (participantId: string) => {
    setParticipantsState((current) => current.filter((participant) => participant.id !== participantId));
    setItemClaims((claims) =>
      claims.map((claim) => ({
        ...claim,
        individualQuantities: Object.fromEntries(
          Object.entries(claim.individualQuantities).filter(([key]) => key !== participantId)
        ),
        sharedWith: claim.sharedWith.filter((id) => id !== participantId),
      }))
    );
  };

  const updateBillItem = (item: BillItem) => {
    setItems((current) => current.map((existing) => (existing.id === item.id ? item : existing)));
  };

  const setBillItems = (nextItems: BillItem[], totals?: { subtotal?: number; total?: number }) => {
    setItems(nextItems);
    setReceiptSubtotal(totals?.subtotal);
    setReceiptTotal(totals?.total);
    setItemClaims((claims) => {
      const existingClaims = claims.filter((claim) => nextItems.some((item) => item.id === claim.itemId));
      const newClaims = nextItems
        .filter((item) => !existingClaims.some((claim) => claim.itemId === item.id))
        .map((item) => buildDefaultClaim(item, participants.map((participant) => participant.id)));
      return [...existingClaims, ...newClaims];
    });
  };

  const addBillItem = () => {
    const id = `item-${Date.now()}`;
    const nextItem: BillItem = {
      id,
      name: 'New item',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
    };
    setItems((current) => [...current, nextItem]);
    setItemClaims((claims) => [
      ...claims,
      buildDefaultClaim(nextItem, participants.map((participant) => participant.id)),
    ]);
  };

  const removeBillItem = (itemId: string) => {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setItemClaims((claims) => claims.filter((claim) => claim.itemId !== itemId));
  };

  const updateItemClaim = (claim: ItemClaim) => {
    setItemClaims((current) => current.map((existing) => (existing.itemId === claim.itemId ? claim : existing)));
  };

  const calculationResult = useMemo(
    () => calculateBillResults(items, participants, itemClaims, { subtotal: receiptSubtotal, total: receiptTotal }),
    [items, participants, itemClaims, receiptSubtotal, receiptTotal]
  );

  const value = {
    state: { receiptItems: items, receiptSubtotal, receiptTotal, participants, itemClaims },
    addParticipant,
    removeParticipant,
    setParticipants,
    restoreState,
    updateBillItem,
    setBillItems,
    addBillItem,
    removeBillItem,
    updateItemClaim,
    calculationResult,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
