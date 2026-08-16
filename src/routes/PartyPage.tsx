import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useAuthContext } from '../context/AuthContext';
import { usePartyContext } from '../context/PartyContext';
import { initializeParty, loadParty, syncParty } from '../google/party';
import { pickGoogleSpreadsheet } from '../google/auth';

export default function PartyPage() {
  const { getAccessToken } = useAuthContext();
  const { restoreState } = useAppContext();
  const { party, setParty } = usePartyContext();
  const navigate = useNavigate();
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null); const [spreadsheetName, setSpreadsheetName] = useState<string | null>(null); const [mode, setMode] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const openSelectedSheet = async (selectedSpreadsheetId: string, token: string) => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'create') await initializeParty(token, selectedSpreadsheetId);
      const party = await loadParty(token, selectedSpreadsheetId);
      restoreState(party.state); setParty(party); navigate('/');
    } catch (cause) { console.error('Unable to open selected Google Sheet:', cause); setError(cause instanceof Error ? cause.message : 'Unable to open this Google Sheet.'); }
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
      <div className="card party-choice-grid">
        <div><h3>Create a new party</h3><p>Use an empty Google Sheet for a new bill.</p><button type="button" onClick={() => setMode('create')}>Create Party</button></div>
        <div><h3>Join an existing party</h3><p>Use a Sheet link shared by the bill owner.</p><button type="button" className="button-secondary" onClick={() => setMode('join')}>Join Party</button></div>
      </div>
    </section>;
  }

  return <section><h2>{mode === 'create' ? 'Create a new party' : 'Join an existing party'}</h2>
    <p>{mode === 'create' ? 'Create an empty Google Sheet, set its sharing permissions, then choose it below.' : 'Choose the shared Google Sheet to load this party.'}</p>
    {party && <div className="card"><p>Connected to shared Google Sheet <code>{party.spreadsheetId}</code>.</p><button type="button" onClick={refresh} disabled={busy}>Refresh from Sheet</button></div>}
    <div className="card">
      <button type="button" disabled={busy} onClick={async () => {
        setError(null); setBusy(true);
        try {
          const token = await getAccessToken();
          const selectedSpreadsheet = await pickGoogleSpreadsheet(token);
          if (!selectedSpreadsheet) return;
          setSpreadsheetId(selectedSpreadsheet.id);
          setSpreadsheetName(selectedSpreadsheet.name);
          await openSelectedSheet(selectedSpreadsheet.id, token);
        }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open Google Picker.'); }
        finally { setBusy(false); }
      }}>{busy ? (spreadsheetName ? `Opening ${spreadsheetName}…` : 'Opening Google Picker…') : 'Choose Google Sheet'}</button>
      {spreadsheetId && <p>Selected Google Sheet: <strong>{spreadsheetName}</strong> <code>{spreadsheetId}</code></p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="button" className="button-secondary" onClick={() => setMode(null)}>Choose a different option</button>
    </div>
  </section>;
}
