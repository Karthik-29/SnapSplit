import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { checkItemsAgainstReceiptTotal } from '../bill/reconciliation';
import { BillDiscount } from '../bill/models';

function ReceiptReview() {
  const { state, updateBillItem, updateReceiptTotals, updateDiscount, addBillItem, removeBillItem, calculationResult } =
    useAppContext();

  // The ₹/% choice is kept locally so the toggle still reflects the user's pick
  // before they've typed a value (a value-less discount isn't stored in state).
  const [discountType, setDiscountType] = useState<BillDiscount['type']>(state.discount?.type ?? 'amount');
  const discountValue = state.discount?.value;
  const appliedDiscount = calculationResult.discount ?? 0;

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

  // A discount on the whole bill: a flat amount or a percentage of the
  // subtotal. It is shared out across participants in proportion to their
  // pre-discount share (see calculateBillResults) and nets out of the total.
  const handleDiscountTypeChange = (value: string) => {
    const type = value === 'percent' ? 'percent' : 'amount';
    setDiscountType(type);
    if (discountValue !== undefined) {
      updateDiscount({ type, value: discountValue });
    }
  };

  const handleDiscountValueChange = (value: string) => {
    if (value.trim() === '') {
      updateDiscount(undefined);
      return;
    }
    updateDiscount({ type: discountType, value: Math.max(0, parseFloat(value) || 0) });
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
                <td>{item.totalPrice.toFixed(2)}</td>
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
          <div>Items total: ₹{reconciliation.itemSum.toFixed(2)}</div>
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
          <label>
            Discount
            <span className="discount-input">
              <select value={discountType} onChange={(event) => handleDiscountTypeChange(event.target.value)}>
                <option value="amount">₹ off</option>
                <option value="percent">% off</option>
              </select>
              <input
                type="number"
                min="0"
                max={discountType === 'percent' ? 100 : undefined}
                placeholder="0"
                value={discountValue ?? ''}
                onChange={(event) => handleDiscountValueChange(event.target.value)}
              />
            </span>
          </label>
          {appliedDiscount > 0 && (
            <p className="field-hint">
              Discount of ₹{appliedDiscount.toFixed(2)} applied — total after discount ₹
              {calculationResult.totalBill.toFixed(2)}, split across participants by their share.
            </p>
          )}
          {reconciliation.status === 'mismatch' && (
            <p className="field-error">
              Items total (₹{reconciliation.itemSum.toFixed(2)}) differs from the receipt {reconciliation.referenceLabel} (₹
              {(reconciliation.referenceValue ?? 0).toFixed(2)}) by ₹{Math.abs(reconciliation.difference ?? 0).toFixed(2)}. Check the items above,
              or correct the receipt {reconciliation.referenceLabel} if OCR misread it.
            </p>
          )}
          {reconciliation.totalBelowSubtotal && (
            <p className="field-error">
              Receipt total (₹{(state.receiptTotal ?? 0).toFixed(2)}) is less than the receipt subtotal (₹{(state.receiptSubtotal ?? 0).toFixed(2)}). A
              payable total can never be lower than the subtotal it was built from — one of these two fields was
              likely misread. Check both against the receipt.
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
