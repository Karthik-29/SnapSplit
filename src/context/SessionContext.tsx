import React, { createContext, useContext, useMemo, useState } from 'react';
import { SessionContextValue, SessionData, SessionParticipant, SessionStatus } from '../session/models';

const STORAGE_PREFIX = 'snapsplit.session.';

function randomSessionSecret() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(36).padStart(2, '0')).join('');
}

function buildStorageKey(secret: string) {
  return `${STORAGE_PREFIX}${secret}`;
}

function persistSession(session: SessionData) {
  window.localStorage.setItem(buildStorageKey(session.sessionSecret), JSON.stringify(session));
}

function loadSessionFromStorage(secret: string): SessionData | undefined {
  const raw = window.localStorage.getItem(buildStorageKey(secret));
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    window.localStorage.removeItem(buildStorageKey(secret));
    return undefined;
  }
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentSession, setCurrentSession] = useState<SessionData | undefined>(undefined);
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);

  const generateSessionLink = (sessionSecret: string) => {
    return `${window.location.origin}/s/${sessionSecret}`;
  };

  const createSession = (
    ownerIdArg: string,
    ownerNameArg: string,
    sheetId?: string,
    sessionSecretOverride?: string
  ) => {
    const sessionSecret = sessionSecretOverride ?? randomSessionSecret();
    const session: SessionData = {
      sessionId: crypto.randomUUID(),
      sessionSecret,
      ownerId: ownerIdArg,
      ownerName: ownerNameArg,
      sheetId,
      createdAt: Date.now(),
      status: 'ACTIVE',
      participants: [],
    };
    persistSession(session);
    setCurrentSession(session);
    setOwnerId(ownerIdArg);
    return session;
  };

  const setSession = (session: SessionData) => {
    persistSession(session);
    setCurrentSession(session);
    setOwnerId(session.ownerId);
  };

  const loadSession = (sessionSecret: string) => {
    const loaded = loadSessionFromStorage(sessionSecret);
    if (loaded) {
      setCurrentSession(loaded);
      setOwnerId(loaded.ownerId);
    }
    return loaded;
  };

  const joinSession = (displayName: string) => {
    if (!currentSession || currentSession.status !== 'ACTIVE') {
      return undefined;
    }

    const participant: SessionParticipant = {
      id: crypto.randomUUID(),
      displayName: displayName.trim() || 'Guest',
      joinedAt: Date.now(),
    };

    const nextSession = {
      ...currentSession,
      participants: [...currentSession.participants, participant],
    };

    persistSession(nextSession);
    setCurrentSession(nextSession);
    return participant;
  };

  const closeSession = () => {
    if (!currentSession) {
      return;
    }

    const nextSession: SessionData = {
      ...currentSession,
      status: 'CLOSED',
    };
    persistSession(nextSession);
    setCurrentSession(nextSession);
  };

  const value = useMemo(
    () => ({
      currentSession,
      isOwner: ownerId !== undefined && currentSession?.ownerId === ownerId,
      createSession,
      setSession,
      loadSession,
      joinSession,
      closeSession,
      generateSessionLink,
    }),
    [currentSession, ownerId]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider');
  }
  return context;
}
