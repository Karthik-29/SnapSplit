import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

function Participants() {
  const { state, addParticipant, removeParticipant } = useAppContext();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const handleAddParticipant = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    // "all" is the reserved label for the select-everyone checkbox in item
    // claiming; a participant with that name would be ambiguous there.
    if (trimmed.toLowerCase() === 'all') {
      setError('"all" is reserved — please choose a different name.');
      return;
    }
    addParticipant(trimmed);
    setNewName('');
    setError('');
  };

  const handleRemoveParticipant = (participantId: string) => {
    removeParticipant(participantId);
  };

  return (
    <section>
      <h2>Participants</h2>
      <p>Specify who shared the bill and who paid.</p>

      <div className="card">
        <table className="receipt-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.participants.map((participant) => (
              <tr key={participant.id}>
                <td>{participant.name}</td>
                <td>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => handleRemoveParticipant(participant.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="participant-add">
          <input
            type="text"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              if (error) setError('');
            }}
            placeholder="New participant"
          />
          <button type="button" onClick={handleAddParticipant}>
            Add
          </button>
        </div>
        {error && <div className="field-error">{error}</div>}
      </div>

      <div className="section-actions">
        <Link to="/review" className="button button-secondary">
          Back to review
        </Link>
        <Link to="/claim" className="button">
          Claim items
        </Link>
      </div>
    </section>
  );
}

export default Participants;
