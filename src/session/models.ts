export type SessionStatus = 'ACTIVE' | 'CLOSED' | 'EXPIRED' | 'DELETED';

export type SessionParticipant = {
  id: string;
  displayName: string;
  joinedAt: number;
};

export type SessionData = {
  sessionId: string;
  sessionSecret: string;
  ownerId: string;
  ownerName: string;
  sheetId?: string;
  createdAt: number;
  status: SessionStatus;
  participants: SessionParticipant[];
};

export type SessionContextValue = {
  currentSession?: SessionData;
  isOwner: boolean;
  createSession: (ownerId: string, ownerName: string, sheetId?: string, sessionSecret?: string) => SessionData;
  setSession: (session: SessionData) => void;
  loadSession: (sessionSecret: string) => SessionData | undefined;
  joinSession: (displayName: string) => SessionParticipant | undefined;
  closeSession: () => void;
  generateSessionLink: (sessionSecret: string) => string;
};
