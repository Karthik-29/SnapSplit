import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuthContext } from '../context/AuthContext';
import { usePartyContext } from '../context/PartyContext';
import { syncParty } from '../google/party';

/** Persists local edits as row-level Sheets updates while a shared party is open. */
export default function PartySync() {
  const { party } = usePartyContext();
  const { state } = useAppContext();
  const { getAccessToken } = useAuthContext();
  const latest = useRef(0);
  useEffect(() => {
    if (!party) return;
    const revision = ++latest.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const token = await getAccessToken();
          if (revision === latest.current) await syncParty(token, { spreadsheetId: party.spreadsheetId, state });
        } catch (error) {
          // Changes remain in local UI; the Party page's refresh action can recover.
          console.error('Unable to sync SnapSplit party:', error);
        }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [party, state, getAccessToken]);
  return null;
}
