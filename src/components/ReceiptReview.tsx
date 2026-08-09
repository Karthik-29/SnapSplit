import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

function ReceiptReview() {
  const { state, updateBillItem, addBillItem, removeBillItem } = useAppContext();
  const totalBill = state.receiptItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const handleQuantityChange = (itemId: string, value: string) => {
    const quantity = Math.max(0, parseInt(value, 10) || 0);
    const item = state.receiptItems.find((entry) => entry.id === itemId);
    if (!item) return;

    updateBillItem({
      ...item,
      quantity,
      totalPrice: quantity * item.unitPrice,
    });
  };

  const handleUnitPriceChange = (itemId: string, value: string) => {
    const unitPrice = Math.max(0, parseInt(value, 10) || 0);
    const item = state.receiptItems.find((entry) => entry.id === itemId);
    if (!item) return;

    updateBillItem({
      ...item,
      unitPrice,
      totalPrice: item.quantity * unitPrice,
    });
  };

  const handleNameChange = (itemId: string, value: string) => {
    const item = state.receiptItems.find((entry) => entry.id === itemId);
    if (!item) return;
    updateBillItem({ ...item, name: value });
  };

  return (
    <section>
      <h2>Review Receipt</h2>
      <p>Edit receipt items and confirm the receipt before proceeding.</p>

      <div className="card">
        <table className="receipt-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.receiptItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(event) => handleNameChange(item.id, event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={(event) => handleQuantityChange(item.id, event.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={item.unitPrice}
                    onChange={(event) => handleUnitPriceChange(item.id, event.target.value)}
                  />
                </td>
                <td>{item.totalPrice}</td>
                <td>
                  <button type="button" onClick={() => removeBillItem(item.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-summary">
          <div>Total receipt: ₹{totalBill}</div>
          <button type="button" onClick={addBillItem}>
            Add item
          </button>
        </div>
      </div>

      <div className="section-actions">
        <Link to="/participants" className="button">
          Continue to participants
        </Link>
      </div>
    </section>
  );
}

export default ReceiptReview;
