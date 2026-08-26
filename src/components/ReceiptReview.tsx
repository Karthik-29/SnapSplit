import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { checkItemsAgainstReceiptTotal } from '../bill/reconciliation';

function ReceiptReview() {
  const { state, updateBillItem, updateReceiptTotals, addBillItem, removeBillItem } = useAppContext();

  const reconciliation = useMemo(
    () => checkItemsAgainstReceiptTotal(state.receiptItems, state.receiptSubtotal, state.receiptTotal),
    [state.receiptItems, state.receiptSubtotal, state.receiptTotal],
  );

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

  // OCR can fail to find a total at all, or misread a digit — exactly the
  // case where the user needs to correct it, the same way item quantity and
  // price are already correctable below. Editing one never clobbers the
  // other.
  const handleSubtotalChange = (value: string) => {
    updateReceiptTotals({
      subtotal: value.trim() === '' ? undefined : Math.max(0, parseFloat(value) || 0),
      total: state.receiptTotal,
    });
  };

  const handleTotalChange = (value: string) => {
    updateReceiptTotals({
      subtotal: state.receiptSubtotal,
      total: value.trim() === '' ? undefined : Math.max(0, parseFloat(value) || 0),
    });
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

        <div className="receipt-totals">
          <div>Items total: ₹{reconciliation.itemSum}</div>
          <label>
            Receipt subtotal
            <input
              type="number"
              min="0"
              placeholder="Not found by OCR"
              value={state.receiptSubtotal ?? ''}
              onChange={(event) => handleSubtotalChange(event.target.value)}
            />
          </label>
          <label>
            Receipt total
            <input
              type="number"
              min="0"
              placeholder="Not found by OCR"
              value={state.receiptTotal ?? ''}
              onChange={(event) => handleTotalChange(event.target.value)}
            />
          </label>
          {reconciliation.status === 'mismatch' && (
            <p className="field-error">
              Items total (₹{reconciliation.itemSum}) differs from the receipt {reconciliation.referenceLabel} (₹
              {reconciliation.referenceValue}) by ₹{Math.abs(reconciliation.difference ?? 0)}. Check the items above,
              or correct the receipt {reconciliation.referenceLabel} if OCR misread it.
            </p>
          )}
        </div>

        <div className="receipt-summary">
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
