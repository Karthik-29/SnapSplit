import { Link, NavLink, Route, Routes } from 'react-router-dom';
import Logo from './components/Logo';
import ReceiptUploadPage from './routes/ReceiptUploadPage';
import ReceiptReviewPage from './routes/ReceiptReviewPage';
import ItemClaimPage from './routes/ItemClaimPage';
import ParticipantsPage from './routes/ParticipantsPage';
import SettlementPage from './routes/SettlementPage';
import SheetExportPage from './routes/SheetExportPage';
import PartyPage from './routes/PartyPage';
import TermsPage from './routes/TermsPage';
import PrivacyPage from './routes/PrivacyPage';
import PartySync from './components/PartySync';
import { usePartyContext } from './context/PartyContext';

function App() {
  const { party } = usePartyContext();

  return (
    <div className="app-shell">
      <PartySync />
      <header className="app-header">
        <div>
          <Link to="/" className="brand" aria-label="SnapSplit home">
            <Logo size={28} />
            <span className="wordmark">Snap<span>Split</span></span>
          </Link>
          <nav>
            {party?.role === 'owner' && <NavLink to="/" end className="nav-link">Upload</NavLink>}
            {party && <><NavLink to="/review" className="nav-link">Review</NavLink>
            <NavLink to="/participants" className="nav-link">Participants</NavLink>
            <NavLink to="/claim" className="nav-link">Claim</NavLink>
            <NavLink to="/settlement" className="nav-link">Settlement</NavLink>
            <NavLink to="/export" className="nav-link">Export</NavLink></>}
            <NavLink to="/party" className="nav-link">Party</NavLink>
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
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </main>
      <footer className="app-footer">
        <nav className="footer-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <a href="https://github.com/Karthik-29/SnapSplit" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </nav>
        <p>
          A free hobby project by Karthik Nagraj. Runs entirely in your browser — use at your own
          risk.
        </p>
      </footer>
    </div>
  );
}

export default App;
