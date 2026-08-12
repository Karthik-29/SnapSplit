import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useAuthContext } from '../context/AuthContext';
import { usePartyContext } from '../context/PartyContext';
import { extractSpreadsheetId, initializeParty, loadParty, syncParty } from '../google/party';

export default function PartyPage() {
  const { user, signIn, getAccessToken } = useAuthContext();
  const { restoreState } = useAppContext();
  const { party, setParty } = usePartyContext();
  const navigate = useNavigate();
  const [url, setUrl] = useState(''); const [mode, setMode] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (!user) { setError('You need to sign in with Google before joining a party.'); return; }
    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) { setError("This doesn't appear to be a valid Google Sheets link."); return; }
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (mode === 'create') await initializeParty(token, spreadsheetId);
      const party = await loadParty(token, spreadsheetId);
      if (!party.state.participants.some((participant) => participant.id === user.id)) {
        party.state.participants.push({ id: user.id, name: user.name });
        await syncParty(token, party);
      }
      restoreState(party.state); setParty(party); navigate('/');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open this Google Sheet.'); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    if (!party) return;
    setError(null); setBusy(true);
    try {
      const refreshed = await loadParty(await getAccessToken(), party.spreadsheetId);
      restoreState(refreshed.state); setParty(refreshed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to refresh this party.'); }
    finally { setBusy(false); }
  };
  if (!mode) {
    return <section><h2>Open SnapSplit</h2>
      <p>Start by opening a Google Sheets-backed party. You can add the bill after the party is ready.</p>
      {!user && <div className="card"><p>Google sign-in is required.</p><button type="button" onClick={() => signIn()}>Sign in with Google</button></div>}
      <div className="card party-choice-grid">
        <div><h3>Create a new party</h3><p>Use an empty Google Sheet for a new bill.</p><button type="button" disabled={!user} onClick={() => setMode('create')}>Create Party</button></div>
        <div><h3>Join an existing party</h3><p>Use a Sheet link shared by the bill owner.</p><button type="button" className="button-secondary" disabled={!user} onClick={() => setMode('join')}>Join Party</button></div>
      </div>
    </section>;
  }

  return <section><h2>{mode === 'create' ? 'Create a new party' : 'Join an existing party'}</h2>
    <p>{mode === 'create' ? 'Create an empty Google Sheet, set its sharing permissions, then paste its link below.' : 'Paste the shared Google Sheets link to load this party.'}</p>
    {!user && <div className="card"><p>Google sign-in is required.</p><button type="button" onClick={() => signIn()}>Sign in with Google</button></div>}
    {party && <div className="card"><p>Connected to shared Google Sheet <code>{party.spreadsheetId}</code>.</p><button type="button" onClick={refresh} disabled={busy}>Refresh from Sheet</button></div>}
    <div className="card">
      <form onSubmit={submit}><label>Google Sheets link<input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." /></label><button disabled={busy || !user} type="submit">{busy ? 'Opening…' : 'Continue'}</button></form>{error && <p className="field-error">{error}</p>}
      <button type="button" className="button-secondary" onClick={() => setMode(null)}>Choose a different option</button>
    </div>
  </section>;
}
