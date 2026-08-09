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
          <div>₹{calculationResult.totalBill}</div>
        </div>

        <h3>Participant balances</h3>
        <table className="receipt-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Paid</th>
              <th>Share</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {calculationResult.participantSummaries.map((summary) => (
              <tr key={summary.participantId}>
                <td>{summary.name}</td>
                <td>₹{summary.paid}</td>
                <td>₹{summary.share}</td>
                <td>{summary.net >= 0 ? `+₹${summary.net}` : `-₹${Math.abs(summary.net)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Settlements</h3>
        {calculationResult.settlements.length === 0 ? (
          <p>No settlements needed.</p>
        ) : (
          <ul>
            {calculationResult.settlements.map((line, index) => (
              <li key={index}>
                {line.from} → {line.to} ₹{line.amount}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default Settlement;
