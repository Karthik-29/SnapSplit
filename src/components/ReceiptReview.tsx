import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { checkItemsAgainstReceiptTotal } from '../bill/reconciliation';
import { BillDiscount } from '../bill/models';

function ReceiptReview() {
  const {
    state,
    updateBillItem,
    updateReceiptTotals,
    updateReceiptDiscount,
    updateDiscount,
    addBillItem,
    removeBillItem,
    calculationResult,
  } = useAppContext();

  // The ₹/% choice is kept locally so the toggle still reflects the user's pick
  // before they've typed a value (a value-less discount isn't stored in state).
  const [discountType, setDiscountType] = useState<BillDiscount['type']>(state.discount?.type ?? 'amount');
  const discountValue = state.discount?.value;
  const appliedDiscount = calculationResult.discount ?? 0;

  const [receiptDiscountType, setReceiptDiscountType] = useState<BillDiscount['type']>(
    state.receiptDiscount?.type ?? 'amount',
  );
  const receiptDiscountValue = state.receiptDiscount?.value;
  // Raw text while the receipt-discount field is being edited, so a percentage
  // the user is mid-typing isn't snapped to its 100 cap on the first keystroke.
  const [receiptDiscountDraft, setReceiptDiscountDraft] = useState<string | null>(null);

  const receiptDiscountError = useMemo(() => {
    const d = state.receiptDiscount;
    if (!d || d.value <= 0) return null;
    if (d.type === 'percent' && d.value > 100) {
      return 'A receipt discount percentage can’t be more than 100%.';
    }
    if (d.type === 'amount' && state.receiptSubtotal !== undefined && d.value > state.receiptSubtotal + 0.01) {
      return `The receipt discount (₹${d.value.toFixed(2)}) is more than the receipt subtotal (₹${state.receiptSubtotal.toFixed(2)}). Check the value against the bill.`;
    }
    return null;
  }, [state.receiptDiscount, state.receiptSubtotal]);

  const reconciliation = useMemo(
    () =>
      checkItemsAgainstReceiptTotal(
        state.receiptItems,
        state.receiptSubtotal,
        state.receiptTotal,
        calculationResult.receiptDiscount ?? 0,
      ),
    [state.receiptItems, state.receiptSubtotal, state.receiptTotal, calculationResult.receiptDiscount],
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

  // The unit price is a free-text field so people can type decimals like
  // "12.50" naturally. While a row is being edited we keep the raw string in
  // priceDrafts so a half-typed "12." isn't snapped back to "12"; on blur we
  // drop the draft and fall back to the parsed number in state.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  const handleUnitPriceChange = (itemId: string, value: string) => {
    // Allow only digits with an optional single decimal point while typing.
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setPriceDrafts((drafts) => ({ ...drafts, [itemId]: value }));

    const item = state.receiptItems.find((entry) => entry.id === itemId);
    if (!item) return;

    const unitPrice = Math.max(0, parseFloat(value) || 0);
    updateBillItem({
      ...item,
      unitPrice,
      totalPrice: item.quantity * unitPrice,
    });
  };

  const handleUnitPriceBlur = (itemId: string) => {
    setPriceDrafts((drafts) => {
      const { [itemId]: _removed, ...rest } = drafts;
      return rest;
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

  // A discount already printed on the receipt (baked into the receipt total),
  // as opposed to one the group is adding on top. A percentage is capped at 100
  // on commit so an out-of-range value never reaches the sheet; the draft still
  // shows what was typed until blur.
  const handleReceiptDiscountTypeChange = (value: string) => {
    const type = value === 'percent' ? 'percent' : 'amount';
    setReceiptDiscountType(type);
    if (receiptDiscountValue !== undefined) {
      updateReceiptDiscount({ type, value: type === 'percent' ? Math.min(receiptDiscountValue, 100) : receiptDiscountValue });
    }
  };

  const handleReceiptDiscountValueChange = (value: string) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    if (value.trim() === '') {
      setReceiptDiscountDraft(null);
      updateReceiptDiscount(undefined);
      return;
    }
    const typed = Math.max(0, parseFloat(value) || 0);
    const committed = receiptDiscountType === 'percent' ? Math.min(typed, 100) : typed;
    setReceiptDiscountDraft(value);
    updateReceiptDiscount({ type: receiptDiscountType, value: committed });
  };

  const handleReceiptDiscountBlur = () => setReceiptDiscountDraft(null);

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
                    className="item-price"
                    type="text"
                    inputMode="decimal"
                    value={priceDrafts[item.id] ?? String(item.unitPrice)}
                    onChange={(event) => handleUnitPriceChange(item.id, event.target.value)}
                    onBlur={() => handleUnitPriceBlur(item.id)}
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
            Receipt discount
            <span className="discount-input">
              <select
                value={receiptDiscountType}
                onChange={(event) => handleReceiptDiscountTypeChange(event.target.value)}
              >
                <option value="amount">₹ off</option>
                <option value="percent">% off</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                placeholder={receiptDiscountType === 'percent' ? '0–100' : '0'}
                value={receiptDiscountDraft ?? (receiptDiscountValue ?? '')}
                onChange={(event) => handleReceiptDiscountValueChange(event.target.value)}
                onBlur={handleReceiptDiscountBlur}
              />
            </span>
          </label>
          <p className="field-hint">
            “Receipt discount” is one already printed on the bill and included in the receipt total.
            Use “Discount” below for a reduction your group is applying on top.
          </p>
          {receiptDiscountError && <p className="field-error">{receiptDiscountError}</p>}
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
