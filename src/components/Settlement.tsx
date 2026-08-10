import { useAppContext } from '../context/AppContext';

function Settlement() {
  const { calculationResult } = useAppContext();

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
        </div>

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
