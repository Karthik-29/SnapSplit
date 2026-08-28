import { Link, Route, Routes } from 'react-router-dom';
import ReceiptUploadPage from './routes/ReceiptUploadPage';
import ReceiptReviewPage from './routes/ReceiptReviewPage';
import ItemClaimPage from './routes/ItemClaimPage';
import ParticipantsPage from './routes/ParticipantsPage';
import SettlementPage from './routes/SettlementPage';
import SheetExportPage from './routes/SheetExportPage';
import PartyPage from './routes/PartyPage';
import PartySync from './components/PartySync';
import { usePartyContext } from './context/PartyContext';

function App() {
  const { party } = usePartyContext();

  return (
    <div className="app-shell">
      <PartySync />
      <header className="app-header">
        <div>
          <h1>SnapSplit</h1>
          <nav>
            {party?.role === 'owner' && <Link to="/">Upload</Link>}
            {party && <><Link to="/review">Review</Link>
            <Link to="/participants">Participants</Link>
            <Link to="/claim">Claim</Link>
            <Link to="/settlement">Settlement</Link>
            <Link to="/export">Export</Link></>}
            <Link to="/party">Party</Link>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          {/* A participant who joined has nothing to upload — the owner's
              receipt already exists. Landing them on Upload risks an
              accidental re-upload that overwrites the shared bill via
              PartySync, so they land on Review (see the bill) instead. */}
          <Route path="/" element={!party ? <PartyPage /> : party.role === 'owner' ? <ReceiptUploadPage /> : <ReceiptReviewPage />} />
          <Route path="/review" element={<ReceiptReviewPage />} />
          <Route path="/claim" element={<ItemClaimPage />} />
          <Route path="/participants" element={<ParticipantsPage />} />
          <Route path="/settlement" element={<SettlementPage />} />
          <Route path="/export" element={<SheetExportPage />} />
          <Route path="/party" element={<PartyPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
