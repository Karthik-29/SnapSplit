import { BillItem, OCRResult, ParsedBill } from './models';
import { parseReceipt } from './parsing/receiptParser';

/**
 * Compatibility boundary for the existing bill-splitting UI. The inference
 * pipeline itself uses minor units; this adapter is intentionally the only
 * conversion back to the app's current major-unit bill model.
 */
export function toLegacyReceipt(parsed: ParsedBill, rawText?: string) {
  const items: BillItem[] = parsed.items
    .filter((item) => item.name.value && item.totalPrice.value !== null)
    .map((item) => ({
      id: item.id,
      name: item.name.value as string,
      // The UI requires a value. An absent OCR quantity is surfaced as one in
      // this adapter only; the ParsedBill retains null and its low confidence.
      quantity: item.quantity.value ?? 1,
      unitPrice: (item.unitPrice.value ?? item.totalPrice.value ?? 0) / 100,
      totalPrice: (item.totalPrice.value ?? 0) / 100,
    }));
  return {
    items,
    subtotal: parsed.subtotal ? parsed.subtotal.value / 100 : undefined,
    total: parsed.total ? parsed.total.value / 100 : undefined,
    rawText,
  };
}

export function parseReceiptData(result: OCRResult) {
  return toLegacyReceipt(parseReceipt(result), result.text);
}

export function parseReceiptLines(result: OCRResult): BillItem[] {
  return parseReceiptData(result).items;
}

export { parseReceipt } from './parsing/receiptParser';
