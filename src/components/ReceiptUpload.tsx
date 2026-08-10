import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { realReceiptOCR } from '../receipt/ocr';
import { parseReceiptData } from '../receipt/parser';
import { BillItem } from '../receipt/models';

function ReceiptUpload() {
  const { setBillItems } = useAppContext();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedItemCount, setParsedItemCount] = useState<number | null>(null);

  const applyParsedItems = (items: BillItem[], totals?: { subtotal?: number; total?: number }) => {
    if (items.length === 0) {
      setError('No receipt items could be parsed.');
      return;
    }

    setBillItems(items, totals);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setError(null);
    setLoading(true);

    try {
      const ocrResult = await realReceiptOCR.extract(file);
      const parsedReceipt = parseReceiptData(ocrResult);
      setParsedItemCount(parsedReceipt.items.length);
      applyParsedItems(parsedReceipt.items, { subtotal: parsedReceipt.subtotal, total: parsedReceipt.total });
    } catch (err) {
      setParsedItemCount(0);
      setError('Failed to parse receipt.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2>Upload Receipt</h2>
      <p>Choose a receipt image to begin the split workflow.</p>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      {imageUrl ? (
        <div className="receipt-preview">
          <img src={imageUrl} alt="Receipt preview" />
        </div>
      ) : (
        <p>No receipt selected yet.</p>
      )}
      {loading && <p>Processing receipt...</p>}
      {parsedItemCount !== null && !loading && !error && (
        <p>{parsedItemCount} receipt items were parsed successfully.</p>
      )}
      {error && <p className="field-error">{error}</p>}
      <div className="section-actions">
        <Link to="/review" className="button" aria-disabled={parsedItemCount === 0 || parsedItemCount === null}>
          Continue to review
        </Link>
        <Link to="/claim" className="button button-secondary" aria-disabled={parsedItemCount === 0 || parsedItemCount === null}>
          Skip OCR and claim
        </Link>
      </div>
    </section>
  );
}

export default ReceiptUpload;
