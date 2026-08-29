import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { runReviewChecks } from '../bill/review';

function Settlement() {
  const { state, calculationResult } = useAppContext();

  const checks = useMemo(
    () =>
      runReviewChecks({
        result: calculationResult,
        items: state.receiptItems,
        receiptSubtotal: state.receiptSubtotal,
        receiptTotal: state.receiptTotal,
        discount: state.discount,
        participantCount: state.participants.length,
      }),
    [calculationResult, state.receiptItems, state.receiptSubtotal, state.receiptTotal, state.discount, state.participants.length],
  );

  const checkSymbol = { pass: '✓', warn: '!', fail: '✕' } as const;

  return (
    <section>
      <h2>Settlement</h2>
      <p>Review the final bill totals and simplified settlement recommendations.</p>

      <div className="card">
        <h3>Summary</h3>
        <div className="summary-grid">
          <div>Total bill</div>
          <div>₹{calculationResult.totalBill.toFixed(2)}</div>
          {calculationResult.subtotal !== undefined && (
            <>
              <div>Subtotal</div>
              <div>₹{calculationResult.subtotal.toFixed(2)}</div>
            </>
          )}
          {calculationResult.tax !== undefined && calculationResult.tax > 0 && (
            <>
              <div>Tax</div>
              <div>₹{calculationResult.tax.toFixed(2)}</div>
            </>
          )}
          {calculationResult.discount !== undefined && calculationResult.discount > 0 && (
            <>
              <div>Discount</div>
              <div>−₹{calculationResult.discount.toFixed(2)}</div>
            </>
          )}
        </div>

        <h3>Checks</h3>
        <ul className="review-checks">
          {checks.map((check) => (
            <li key={check.id} className={check.status}>
              <span className="review-checks-icon" aria-hidden="true">{checkSymbol[check.status]}</span>
              <span>
                {check.label}
                {check.detail && <span className="review-checks-detail"> — {check.detail}</span>}
              </span>
            </li>
          ))}
        </ul>

        {calculationResult.itemsNeedingReview.length > 0 && (
          <p className="field-error" role="alert">
            {calculationResult.itemsNeedingReview.length === 1 ? 'This item has' : 'These items have'} more claimed
            quantity than is actually available: {calculationResult.itemsNeedingReview.map((item) => item.name).join(', ')}.
            Shares below are capped to what's actually available so they still add up correctly, but the claim itself
            hasn't changed — go back to Item Claims to fix it properly.
          </p>
        )}

        <h3>Participant shares</h3>
        <table className="receipt-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {calculationResult.participantSummaries.map((summary) => (
              <tr key={summary.participantId}>
                <td>{summary.name}</td>
                <td>₹{summary.share.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default Settlement;
