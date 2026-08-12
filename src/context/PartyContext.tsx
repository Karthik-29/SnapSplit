import React, { createContext, useContext, useMemo, useState } from 'react';
import { Party } from '../google/party';

type PartyContextValue = { party: Party | null; setParty: (party: Party | null) => void };
const PartyContext = createContext<PartyContextValue | undefined>(undefined);

export const PartyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [party, setParty] = useState<Party | null>(null);
  const value = useMemo(() => ({ party, setParty }), [party]);
  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
};
export function usePartyContext() {
  const context = useContext(PartyContext);
  if (!context) throw new Error('usePartyContext must be used within PartyProvider');
  return context;
}
