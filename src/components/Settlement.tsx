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
        receiptDiscount: state.receiptDiscount,
        discount: state.discount,
        participantCount: state.participants.length,
        itemClaims: state.itemClaims,
      }),
    [calculationResult, state.receiptItems, state.receiptSubtotal, state.receiptTotal, state.receiptDiscount, state.discount, state.participants.length, state.itemClaims],
  );

  const checkSymbol = { pass: '✓', warn: '!', fail: '✕' } as const;

  // Summary card figures. Everything here is display-only — the numbers come
  // straight off `calculationResult` and are never fed back into the engine.
  const round2 = (value: number) => Number(value.toFixed(2));
  const subtotal = calculationResult.subtotal ?? 0;
  const receiptDiscountAmt = calculationResult.receiptDiscount ?? 0;
  // The "on top" discount the group applied (the total discount minus the part
  // that was already printed on the receipt).
  const groupDiscountAmt = round2((calculationResult.discount ?? 0) - receiptDiscountAmt);
  // The receipt's own grand total, before any group discount. Tax for the card
  // is derived from this minus the subtotal, so it never carries the engine's
  // receipt-discount add-back (which would otherwise read as tax inflated by the
  // receipt-discount amount).
  const preGroupTotal = calculationResult.total ?? calculationResult.totalBill;
  const taxRow = round2(preGroupTotal - subtotal);
  // A pre-tax receipt discount sitting between a pre-discount subtotal line and
  // the total drives `taxRow` negative — show it as its own reduction row (sized
  // so the column still foots) instead of a tax line.
  const showReceiptDiscountRow = taxRow < 0 && receiptDiscountAmt > 0;
  const hasGroupDiscount = groupDiscountAmt > 0;
  const amountPaid = calculationResult.totalBill;

  return (
    <section>
      <h2>Settlement</h2>
      <p>Review the final bill totals and simplified settlement recommendations.</p>

      <div className="card">
        <h3>Summary</h3>
        <div className="summary-grid">
          {calculationResult.subtotal !== undefined && (
            <>
              <div>Subtotal</div>
              <div className="summary-value">₹{subtotal.toFixed(2)}</div>
            </>
          )}
          {taxRow > 0 && (
            <>
              <div>Tax</div>
              <div className="summary-value">+₹{taxRow.toFixed(2)}</div>
            </>
          )}
          {showReceiptDiscountRow && (
            <>
              <div>Receipt discount</div>
              <div className="summary-value">−₹{(subtotal - preGroupTotal).toFixed(2)}</div>
            </>
          )}
          {hasGroupDiscount && (
            <>
              <div className="summary-rule" />
              <div>Bill total</div>
              <div className="summary-value">₹{preGroupTotal.toFixed(2)}</div>
              <div>Discount</div>
              <div className="summary-value">−₹{groupDiscountAmt.toFixed(2)}</div>
            </>
          )}
          <div className="summary-rule" />
          <div className="summary-total">{hasGroupDiscount ? 'Amount paid' : 'Total bill'}</div>
          <div className="summary-total summary-value">₹{amountPaid.toFixed(2)}</div>
        </div>
        {receiptDiscountAmt > 0 && !showReceiptDiscountRow && (
          <p className="field-hint">
            Receipt total already includes a ₹{receiptDiscountAmt.toFixed(2)} discount.
          </p>
        )}

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
