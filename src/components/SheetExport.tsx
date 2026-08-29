import { Link } from 'react-router-dom';
import { usePartyContext } from '../context/PartyContext';

function SheetExport() {
  const { party } = usePartyContext();
  return (
    <section>
      <h2>Google Sheets Party</h2>
      {party ? (
        <div className="card"><p>This bill is connected to a Google Sheet. Your edits are saved there automatically.</p><p>Spreadsheet ID: <code>{party.spreadsheetId}</code></p></div>
      ) : (
        <div className="card"><p>No shared party is open. Create or join a Google Sheets party to persist and share this bill.</p></div>
      )}
      <div className="section-actions"><Link className="button" to="/party">Open Party</Link></div>
    </section>
  );
}

export default SheetExport;
