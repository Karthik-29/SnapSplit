import { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { splitSharedItemEvenly } from '../bill/splitting';

function ItemClaim() {
  const { state, updateItemClaim } = useAppContext();

  const handleModeChange = (itemId: string, mode: 'individual' | 'shared') => {
    const claim = state.itemClaims.find((entry) => entry.itemId === itemId);
    if (!claim) return;
    // Preserve a row for every previous shared participant when returning to
    // individual claims, so the Sheets repository can update that same claim.
    const individualQuantities = mode === 'individual'
      ? { ...claim.individualQuantities, ...Object.fromEntries(claim.sharedWith.map((id) => [id, 0])) }
      : claim.individualQuantities;
    updateItemClaim({ ...claim, mode, individualQuantities });
  };

  const handleQuantityChange = (itemId: string, participantId: string, value: string) => {
    const claim = state.itemClaims.find((entry) => entry.itemId === itemId);
    if (!claim) return;
    const item = state.receiptItems.find((entry) => entry.id === itemId);
    if (!item) return;
    const requestedQuantity = Math.max(0, parseInt(value, 10) || 0);
    const claimedByOthers = Object.entries(claim.individualQuantities)
      .filter(([id]) => id !== participantId)
      .reduce((sum, [, claimed]) => sum + claimed, 0);
    const quantity = Math.min(requestedQuantity, Math.max(0, item.quantity - claimedByOthers));
    updateItemClaim({
      ...claim,
      individualQuantities: {
        ...claim.individualQuantities,
        [participantId]: quantity,
      },
    });
  };

  const handleSharedToggle = (itemId: string, participantId: string, checked: boolean) => {
    const claim = state.itemClaims.find((entry) => entry.itemId === itemId);
    if (!claim) return;

    const sharedWith = checked
      ? [...claim.sharedWith, participantId]
      : claim.sharedWith.filter((id) => id !== participantId);

    updateItemClaim({ ...claim, sharedWith });
  };

  return (
    <section>
      <h2>Item Claiming</h2>
      <p>Assign each item to participants individually or split it among a selected group.</p>

      <div className="card">
        {state.receiptItems.map((item) => {
          const claim = state.itemClaims.find((entry) => entry.itemId === item.id);
          if (!claim) return null;

          const sharedSplit = claim.mode === 'shared' ? splitSharedItemEvenly(item, claim.sharedWith) : {};
          const totalClaimed = Object.values(claim.individualQuantities).reduce((sum, q) => sum + q, 0);
          const remaining = Math.max(0, item.quantity - totalClaimed);
          const isValid = totalClaimed <= item.quantity;
          const sharedWarning = claim.mode === 'shared' && claim.sharedWith.length === 0;

          return (
            <div key={item.id} className="item-claim-card">
              <div className="item-header">
                <div>
                  <strong>{item.name}</strong>
                  <div>
                    Qty: {item.quantity} · Total: ₹{item.totalPrice}
                  </div>
                </div>
                <div className="claim-mode-toggle">
                  <label>
                    <input
                      type="radio"
                      checked={claim.mode === 'individual'}
                      onChange={() => handleModeChange(item.id, 'individual')}
                    />
                    Individual
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={claim.mode === 'shared'}
                      onChange={() => handleModeChange(item.id, 'shared')}
                    />
                    Shared
                  </label>
                </div>
              </div>

              {claim.mode === 'individual' ? (
                <table className="receipt-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Quantity</th>
                      <th>Share</th>
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
                            value={claim.individualQuantities[participant.id] ?? 0}
                            onChange={(event) => handleQuantityChange(item.id, participant.id, event.target.value)}
                          />
                        </td>
                        <td>₹{(claim.individualQuantities[participant.id] ?? 0) * item.unitPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="shared-split">
                  <p>Select who shares this item:</p>
                  <div className="participant-checkboxes">
                    {state.participants.map((participant) => (
                      <label key={participant.id}>
                        <input
                          type="checkbox"
                          checked={claim.sharedWith.includes(participant.id)}
                          onChange={(event) => handleSharedToggle(item.id, participant.id, event.target.checked)}
                        />
                        {participant.name}
                      </label>
                    ))}
                  </div>
                  {sharedWarning ? (
                    <div className="field-error">Select at least one person to split this item.</div>
                  ) : (
                    <table className="receipt-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claim.sharedWith.map((participantId) => {
                          const participant = state.participants.find((p) => p.id === participantId);
                          return (
                            <tr key={participantId}>
                              <td>{participant?.name ?? participantId}</td>
                              <td>₹{sharedSplit[participantId] ?? 0}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {!isValid && (
                <div className="field-error">Total claimed quantity exceeds available quantity.</div>
              )}

              <div className="receipt-summary">
                <span>Total claimed quantity: {totalClaimed}</span>
                {claim.mode === 'individual' ? (
                  <span>Remaining quantity: {remaining}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-actions">
        <Link to="/settlement" className="button">
          Review settlement
        </Link>
      </div>
    </section>
  );
}

export default ItemClaim;
