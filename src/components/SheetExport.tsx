import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { mockExportToGoogleSheet } from '../google/sheets';

function SheetExport() {
  const { state, calculationResult } = useAppContext();
  const [isExporting, setIsExporting] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setIsExporting(true);
    try {
      const result = await mockExportToGoogleSheet(state.receiptItems, calculationResult);
      setSheetUrl(result.sheetUrl);
    } catch (err) {
      setError('Failed to export to Google Sheets.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section>
      <h2>Export to Sheets</h2>
      <p>Mock export the finalized bill into a Google Sheet.</p>
      <div className="card">
        <button type="button" onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'Exporting…' : 'Export to Google Sheets'}
        </button>
        {sheetUrl && (
          <p>
            Export complete. View it here: <a href={sheetUrl}>{sheetUrl}</a>
          </p>
        )}
        {error && <p className="field-error">{error}</p>}
      </div>
    </section>
  );
}

export default SheetExport;
