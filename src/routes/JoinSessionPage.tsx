import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSessionContext } from '../context/SessionContext';

export function JoinSessionPage() {
  const { sessionSecret } = useParams();
  const navigate = useNavigate();
  const { loadSession, joinSession, currentSession } = useSessionContext();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionSecret) {
      setError('Invalid session URL.');
      return;
    }

    const session = loadSession(sessionSecret);
    if (!session) {
      setError(
        'This session is not available in this browser. Shared sessions are currently stored in localStorage, so the link only works in the same browser where it was created.'
      );
      return;
    }

    if (session.status !== 'ACTIVE') {
      setError('This session is not active.');
      return;
    }
  }, [loadSession, sessionSecret]);

  const handleJoin = () => {
    if (!sessionSecret) {
      setError('Unable to join session.');
      return;
    }

    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }

    const participant = joinSession(name.trim());
    if (!participant) {
      setError('Unable to join session at this time.');
      return;
    }

    navigate('/claim');
  };

  if (error) {
    return (
      <section>
        <h2>Join SnapSplit Session</h2>
        <p>{error}</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Join SnapSplit Session</h2>
      <p>Enter your display name to join the shared bill.</p>
      <div className="card">
        <label>
          Name
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="button" onClick={handleJoin}>
          Join session
        </button>
      </div>
      {currentSession && (
        <div className="card">
          <p>Session Owner: {currentSession.ownerName}</p>
          <p>Session created at: {new Date(currentSession.createdAt).toLocaleString()}</p>
          <div className="session-members">
            <h3>Current session members</h3>
            <ul>
              <li>
                <strong>{currentSession.ownerName}</strong> (owner)
              </li>
              {currentSession.participants.length > 0 ? (
                currentSession.participants.map((participant) => (
                  <li key={participant.id}>{participant.displayName}</li>
                ))
              ) : (
                <li>No guests have joined yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
