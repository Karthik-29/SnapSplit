import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

function Participants() {
  const { state, addParticipant, updateParticipantPaid } = useAppContext();
  const [newName, setNewName] = useState('');

  const handleAddParticipant = () => {
    if (!newName.trim()) {
      return;
    }
    addParticipant(newName.trim());
    setNewName('');
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
              <th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {state.participants.map((participant) => (
              <tr key={participant.id}>
                <td>{participant.name}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={participant.paidAmount}
                    onChange={(event) => updateParticipantPaid(participant.id, Number(event.target.value))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="participant-add">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New participant"
          />
          <button type="button" onClick={handleAddParticipant}>
            Add
          </button>
        </div>
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
