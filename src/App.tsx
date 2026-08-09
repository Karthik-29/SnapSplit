import { Link, Route, Routes } from 'react-router-dom';
import ReceiptUploadPage from './routes/ReceiptUploadPage';
import ReceiptReviewPage from './routes/ReceiptReviewPage';
import ItemClaimPage from './routes/ItemClaimPage';
import ParticipantsPage from './routes/ParticipantsPage';
import SettlementPage from './routes/SettlementPage';
import SheetExportPage from './routes/SheetExportPage';
import { useAuthContext } from './context/AuthContext';

function App() {
  const { user, signIn, signOut } = useAuthContext();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>SnapSplit</h1>
          <nav>
            <Link to="/">Upload</Link>
            <Link to="/review">Review</Link>
            <Link to="/participants">Participants</Link>
            <Link to="/claim">Claim</Link>
            <Link to="/settlement">Settlement</Link>
            <Link to="/export">Export</Link>
          </nav>
        </div>
        <div className="auth-controls">
          {user ? (
            <>
              <span>{user.name}</span>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" onClick={signIn}>
              Sign in with Google
            </button>
          )}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ReceiptUploadPage />} />
          <Route path="/review" element={<ReceiptReviewPage />} />
          <Route path="/claim" element={<ItemClaimPage />} />
          <Route path="/participants" element={<ParticipantsPage />} />
          <Route path="/settlement" element={<SettlementPage />} />
          <Route path="/export" element={<SheetExportPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
