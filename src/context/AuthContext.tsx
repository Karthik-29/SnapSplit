import React, { createContext, useContext, useState } from 'react';
import { requestGoogleAccessToken, revokeGoogleAccessToken } from '../google/auth';

export type AuthContextValue = {
  accessToken: string | null;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const getAccessToken = async () => {
    if (accessToken) return accessToken;
    const tokenResult = await requestGoogleAccessToken();
    setAccessToken(tokenResult.accessToken);
    return tokenResult.accessToken;
  };

  const signOut = async () => {
    if (accessToken) await revokeGoogleAccessToken(accessToken);
    setAccessToken(null);
  };

  return (
    <AuthContext.Provider value={{ accessToken, signOut, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used within AuthProvider');
  return context;
}
