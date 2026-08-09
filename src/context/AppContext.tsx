import React, { createContext, useContext, useMemo, useState } from 'react';
import { BillItem } from '../receipt/models';
import { buildDefaultClaim } from '../bill/claims';
import { calculateBillResults } from '../bill/settlement';
import { BillState, ItemClaim, Participant } from '../bill/models';

export type AppContextValue = {
  state: BillState;
  addParticipant: (name: string) => void;
  updateParticipantPaid: (id: string, paidAmount: number) => void;
  updateBillItem: (item: BillItem) => void;
  setBillItems: (items: BillItem[]) => void;
  addBillItem: () => void;
  removeBillItem: (itemId: string) => void;
  updateItemClaim: (claim: ItemClaim) => void;
  calculationResult: ReturnType<typeof calculateBillResults>;
};

const initialItems: BillItem[] = [];

const defaultParticipants: Participant[] = [
  { id: 'user-1', name: 'Karthik', paidAmount: 1240 },
  { id: 'user-2', name: 'Rahul', paidAmount: 0 },
  { id: 'user-3', name: 'Amit', paidAmount: 0 },
];

const initialClaims: ItemClaim[] = [];

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<BillItem[]>(initialItems);
  const [participants, setParticipants] = useState<Participant[]>(defaultParticipants);
  const [itemClaims, setItemClaims] = useState<ItemClaim[]>(initialClaims);

  const addParticipant = (name: string) => {
    const id = `user-${Date.now()}`;
    const nextParticipants = [...participants, { id, name, paidAmount: 0 }];
    setParticipants(nextParticipants);
    setItemClaims((claims) => claims.map((claim) => ({
      ...claim,
      individualQuantities: { ...claim.individualQuantities, [id]: 0 },
    })));
  };

  const updateParticipantPaid = (id: string, paidAmount: number) => {
    setParticipants((current) => current.map((participant) => (participant.id === id ? { ...participant, paidAmount } : participant)));
  };

  const updateBillItem = (item: BillItem) => {
    setItems((current) => current.map((existing) => (existing.id === item.id ? item : existing)));
  };

  const setBillItems = (nextItems: BillItem[]) => {
    setItems(nextItems);
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
    () => calculateBillResults(items, participants, itemClaims),
    [items, participants, itemClaims]
  );

  const value = {
    state: { receiptItems: items, participants, itemClaims },
    addParticipant,
    updateParticipantPaid,
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
