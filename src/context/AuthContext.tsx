import React, { createContext, useContext, useState } from 'react';
import { GoogleUser, requestGoogleSignIn, revokeGoogleAccessToken, isGoogleAuthConfigured } from '../google/auth';

export type AuthContextValue = {
  user: GoogleUser | null;
  accessToken: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string>;
  isSigningIn: boolean;
  signInError: string | null;
  isConfigured: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const signIn = async () => {
    if (!isGoogleAuthConfigured) {
      throw new Error('Google auth is not configured. Set VITE_GOOGLE_CLIENT_ID in your environment (.env file).');
    }

    setIsSigningIn(true);
    setSignInError(null);
    try {
      const nextUser = await requestGoogleSignIn();
      setUser(nextUser);
      setAccessToken(null);
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Google sign in failed.');
      throw err;
    } finally {
      setIsSigningIn(false);
    }
  };

  const getAccessToken = async () => {
    if (accessToken) {
      return accessToken;
    }

    const tokenResult = await requestGoogleAccessToken();
    setAccessToken(tokenResult.accessToken);
    return tokenResult.accessToken;
  };

  const signOut = async () => {
    if (accessToken) {
      await revokeGoogleAccessToken(accessToken);
    }
    setUser(null);
    setAccessToken(null);
    setSignInError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        signIn,
        signOut,
        getAccessToken,
        isSigningIn,
        signInError,
        isConfigured: isGoogleAuthConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}
