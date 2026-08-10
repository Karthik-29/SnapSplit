import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuthContext } from '../context/AuthContext';
import { useSessionContext } from '../context/SessionContext';
import { mockExportToGoogleSheet } from '../google/sheets';

function SheetExport() {
  const { state, calculationResult, addParticipant } = useAppContext();
  const { user, signIn, getAccessToken } = useAuthContext();
  const { currentSession, isOwner, createSession, generateSessionLink } = useSessionContext();
  const [isExporting, setIsExporting] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

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

  const handleSignIn = async () => {
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed.');
    }
  };

  const handleCreateSession = async () => {
    if (!user) {
      setError('You must sign in before creating a session.');
      return;
    }

    if (!state.participants.some((participant) => participant.id === user.id)) {
      addParticipant(user.name, user.id);
    }

    const session = createSession(user.id, user.name);
    const link = generateSessionLink(session.sessionSecret);
    setShareLink(link);
  };

  const handleCopyLink = async () => {
    if (!shareLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopySuccess('Copied to clipboard');
      window.setTimeout(() => setCopySuccess(null), 2000);
    } catch {
      setError('Unable to copy link.');
    }
  };

  return (
    <section>
      <h2>Export & Share</h2>
      <p>Use Google sign-in to create a private SnapSplit session and generate a shareable session link.</p>

      {!user ? (
        <div className="card">
          <p>Sign in with Google to create and share a bill session.</p>
          <button type="button" onClick={handleSignIn}>
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className="card">
          <p>Signed in as {user.name}. Create a session to let friends claim items without needing Google.</p>
          <button type="button" onClick={handleCreateSession}>
            Create shareable session
          </button>
          {shareLink && (
            <div className="session-share">
              <p>Share this session link with friends:</p>
              <div className="session-link">{shareLink}</div>
              <p className="field-note">
                Note: This app currently stores sessions in the browser, so the link will only work in the same browser environment.
              </p>
              <button type="button" onClick={handleCopyLink}>
                Copy link
              </button>
              {copySuccess && <p>{copySuccess}</p>}
            </div>
          )}
        </div>
      )}

      {currentSession && isOwner && !shareLink && (
        <div className="card">
          <p>Existing active session:</p>
          <div>Session ID: {currentSession.sessionId}</div>
          <div>Created at: {new Date(currentSession.createdAt).toLocaleString()}</div>
        </div>
      )}

      <div className="card">
        <h3>Export to Google Sheets</h3>
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
