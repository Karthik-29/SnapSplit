import {
  Adjustment, ChargeComponent, MonetaryValue, OCRLine, OCRResult, OCRToken, ParsedBill, ParsedBillItem,
  ReceiptSection, TaxComponent, TotalCandidate,
} from '../models';
import { detectAmountColumn, detectNumericColumnsDetailed } from '../layout/columnDetection';
import { toBoundingBox } from '../layout/normalizeTokens';
import { detectLines } from '../layout/lineDetection';
import { classifyLine } from './sectionClassifier';
import { hasNameLikeWord, isMetadataLine } from './keywordMatcher';
import { parseMoney, parseQuantity } from './numberParser';

const SUMMARY_SECTIONS: ReceiptSection[] = ['subtotal', 'tax', 'service_charge', 'discount', 'adjustment', 'total', 'payment'];

function confidence(tokens: OCRToken[], baseline = 0.75) {
  const values = tokens.map((token) => token.confidence).filter((value): value is number => typeof value === 'number');
  return values.length ? Math.max(0, Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length / 100)) : baseline;
}

function fallbackLines(text: string): OCRLine[] {
  return text.split(/\r?\n/).map((value, index) => ({
    text: value.trim(), tokens: value.trim() ? [{ text: value.trim() }] : [],
    boundingBox: { x: 0, y: index * 24, width: value.length * 8, height: 18 },
  })).filter((line) => line.text);
}

function labelOf(line: OCRLine) {
  return line.text.replace(/[₹$€£]/g, '').replace(/[-+]?[\d.,]+/g, ' ').replace(/[:;|()[\]{}-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

type AmountEntry = { token: OCRToken; text: string; parsed: NonNullable<ReturnType<typeof parseMoney>> };

function isAmountEntry(entry: { token: OCRToken; text: string; parsed: ReturnType<typeof parseMoney> }): entry is AmountEntry {
  return entry.parsed !== null;
}

/**
 * Recovers monetary values from a line, using token geometry when it exists.
 *
 * Two OCR artifacts are handled explicitly because both silently corrupt totals:
 * Tesseract splits a decimal across tokens ("650." + "00"), which would
 * otherwise reduce a ₹650.00 subtotal to ₹0.00 by taking the trailing "00"; and
 * rate annotations like "@2.5%" parse as perfectly good money while being a
 * percentage, not an amount.
 *
 * Each entry also carries its raw matched text alongside the parsed money
 * value. The two are not interchangeable: `parsed.value` is money-scaled
 * (minor units — "2.00" becomes 200), while a quantity is a plain count. A
 * caller reading `parsed.value` where it means "quantity" would silently
 * multiply every quantity by 100.
 */
// A genuine rate annotation ("@2.5%") never carries a currency symbol. A token
// that does (e.g. "$45.8%" — a receipt's own "$45.85" with its final digit
// misread as "%") is a corrupted amount, not a rate, and discarding it
// outright throws away a real subtotal/total for no reason. Once such a token
// reaches parseMoney, its existing character-stripping removes the stray "%"
// and its existing `corrected` flag already reports that a correction
// happened — nothing else needs to change downstream.
function isRateAnnotation(text: string): boolean {
  return /^@?\d+(?:\.\d+)?%$/.test(text) && !/[₹$€£]/.test(text);
}

// A genuine amount token, once a leading currency indicator is stripped, is
// nothing but digit-like characters and separators. A token merely
// *containing* a digit is not enough: OCR garbling an item name can leave a
// digit fragment inside it (e.g. "BLACK" misread as "34K"), and treating that
// as a candidate amount corrupts the positional quantity/rate/total
// assignment for the whole row. Requiring the token to be predominantly
// numeric — not just digit-containing — rejects "34K" while still accepting
// "$8.95", "Rs 178.00", and OCR's own O/o/I/l-for-0/1 substitutions (resolved
// later, in parseMoney).
const CURRENCY_PREFIX = /^(?:Rs\.?|INR|USD|EUR|GBP|[₹$€£])\s*/i;
function isAmountLikeToken(text: string): boolean {
  const withoutCurrency = text.replace(CURRENCY_PREFIX, '').trim();
  // A trailing "%" is allowed structurally: `isRateAnnotation` (checked
  // separately by callers) is what actually distinguishes a genuine rate
  // annotation from a currency-prefixed amount with a corrupted trailing
  // digit (e.g. "$45.8%" — a "$45.85" whose final "5" OCR misread as "%").
  return /^-?[0-9OoIl]+(?:[.,'][0-9OoIl]+)*%?$/.test(withoutCurrency);
}

function amountsOf(line: OCRLine): AmountEntry[] {
  if (line.tokens.length > 1) {
    const merged: Array<{ token: OCRToken; text: string }> = [];
    for (let index = 0; index < line.tokens.length; index += 1) {
      const token = line.tokens[index];
      const next = line.tokens[index + 1];
      if (next && /\d[.,]$/.test(token.text) && /^\d{2}$/.test(next.text)) {
        merged.push({ token, text: `${token.text}${next.text}` });
        index += 1;
        continue;
      }
      merged.push({ token, text: token.text });
    }
    return merged
      .filter((entry) => isAmountLikeToken(entry.text) && !isRateAnnotation(entry.text))
      .map((entry) => ({ token: entry.token, text: entry.text, parsed: parseMoney(entry.text) }))
      .filter(isAmountEntry);
  }

  return [...line.text.matchAll(/(?:Rs\.?|INR|USD|EUR|GBP|[$])?\s*-?[0-9OoIl]+(?:[,.']\s*[0-9OoIl]+)?/gi)]
    .filter((match) => {
      if (!/\d/.test(match[0])) return false;
      // Reject a numeric-looking run embedded inside a longer word (the "34"
      // in a garbled "34K") — the same corruption the token-level check
      // above guards against, for the geometry-less text-only path. The
      // pattern's own leading `\s*` can pull whitespace into match[0] (a
      // match right after a word boundary, e.g. "Salted 1", captures " 1"),
      // so the boundary must be checked at the trimmed content, not the raw
      // match span, or a genuine amount right after a name gets rejected.
      const leading = match[0].length - match[0].trimStart().length;
      const trimmedLength = match[0].trim().length;
      const start = (match.index ?? 0) + leading;
      const before = line.text[start - 1];
      const after = line.text[start + trimmedLength];
      return !(before && /[A-Za-z]/.test(before)) && !(after && /[A-Za-z]/.test(after));
    })
    .map((match) => ({ token: line.tokens[0], text: match[0], parsed: parseMoney(match[0]) }))
    .filter(isAmountEntry);
}

/**
 * No real word content, but does contain a parseable amount — the
 * narrow-receipt shape where a quantity (or rate) is printed alone on its own
 * line. A line with any letters, even noisy OCR letters, never qualifies:
 * that's what keeps a wrapped name line like "Special 9 Recipe" from ever
 * leaking its embedded "9" into numeric role assignment.
 */
function isBareNumericLine(line: OCRLine) {
  return !hasNameLikeWord(line.text) && amountsOf(line).length > 0;
}

type QuantityAndRate = { quantity: number | null; unitPrice: number | null; source: 'ocr' | 'derived' };

/**
 * Assigns quantity/rate roles positionally over an amount sequence, never by
 * searching for "any number that happens to fit" — that coincidence-based
 * search is what let a printed rate get mistaken for a quantity whenever a
 * row shows rate and amount identically (qty=1 implied, not printed).
 */
function resolveQuantityAndRate(values: AmountEntry[], totalEntry: AmountEntry): QuantityAndRate {
  // 1 minor unit — the same tolerance used below for the file's top-level
  // reconciliation check, so "close enough" has one definition in this file.
  const TOLERANCE = 1;

  if (values.length >= 3) {
    const quantity = parseQuantity(values[0].text);
    const rate = values[values.length - 2]; // for length 3 this is the sole middle value
    if (quantity && quantity > 0) {
      const expected = quantity * rate.parsed.value;
      if (Math.abs(expected - totalEntry.parsed.value) <= TOLERANCE) {
        return { quantity, unitPrice: rate.parsed.value, source: 'ocr' };
      }
      // A printed total that's ~100x (or ~1/100x) the cross-validated expected
      // amount is a classic symptom of OCR dropping — or hallucinating — a
      // decimal point on that one token. The rate was read independently and
      // is still trustworthy; trust it for unitPrice rather than deriving a
      // unit price from a total we have direct evidence is corrupted. The
      // total itself is left exactly as extracted — never silently rewritten.
      if (Math.abs(expected - totalEntry.parsed.value / 100) <= TOLERANCE
        || Math.abs(expected - totalEntry.parsed.value * 100) <= TOLERANCE) {
        return { quantity, unitPrice: rate.parsed.value, source: 'ocr' };
      }
      if (totalEntry.parsed.value % Math.round(quantity) === 0) {
        return { quantity, unitPrice: Math.round(totalEntry.parsed.value / quantity), source: 'derived' };
      }
    }
    return { quantity: null, unitPrice: null, source: 'derived' };
  }

  if (values.length === 2) {
    const [a, b] = values; // b === totalEntry
    if (a.parsed.value === b.parsed.value) {
      // Rate and amount printed identically ⇒ qty=1 was implied, not printed.
      return { quantity: 1, unitPrice: b.parsed.value, source: 'ocr' };
    }
    const quantity = parseQuantity(a.text);
    if (quantity && quantity > 0 && b.parsed.value % Math.round(quantity) === 0) {
      return { quantity, unitPrice: Math.round(b.parsed.value / quantity), source: 'derived' };
    }
    return { quantity: null, unitPrice: null, source: 'derived' };
  }

  return { quantity: null, unitPrice: null, source: 'derived' }; // values.length === 1
}

/**
 * Builds one item from the lines buffered ahead of it plus its anchor line(s).
 *
 * `anchorLines` is usually a single line (name+numbers together, or a lone
 * amount), but can be more than one: a narrow receipt can print quantity,
 * rate, and total as three separate bare-numeric lines, and the caller groups
 * a run of them together before calling this, so all of it feeds one item.
 */
// No real receipt in this codebase's own ground truth (realReceiptFixtures.ts)
// prints a single line-item quantity above 4. A garbled non-item line (a
// summary/footer row OCR can't classify) occasionally contains three numbers
// that are internally consistent (qty * rate == total) purely by coincidence,
// which is exactly the evidence resolveQuantityAndRate uses to trust a row —
// so an implausible quantity is treated as proof the whole row is not a
// genuine item, not just an unreliable quantity to null out (nulling only the
// quantity would still leave the row's inflated total in the bill).
const MAX_PLAUSIBLE_ITEM_QUANTITY = 50;

function parseItem(anchorLines: OCRLine[], pendingLines: OCRLine[], index: number): ParsedBillItem | null {
  const allText = [...pendingLines.map((entry) => entry.text), ...anchorLines.map((entry) => entry.text)].join(' ').replace(/\s+/g, ' ').trim();
  if (!hasNameLikeWord(allText) || isMetadataLine(allText)) return null;
  const values = [...pendingLines.filter(isBareNumericLine).flatMap(amountsOf), ...anchorLines.flatMap(amountsOf)];
  if (!values.length) return null;
  const totalEntry = values[values.length - 1];
  if (totalEntry.parsed.value <= 0) return null;

  const { quantity, unitPrice, source } = resolveQuantityAndRate(values, totalEntry);
  if (quantity !== null && quantity > MAX_PLAUSIBLE_ITEM_QUANTITY) return null;
  let name = allText.replace(/(?:[₹$€£]\s*)?\d+(?:[.,]\d+)?/g, ' ').replace(/\s+/g, ' ').trim();
  // A quantity/price row without token geometry has the numeric columns at the end.
  name = name
    .replace(/^\d+\s+/, '')
    .replace(/\s+\[?[Ii]\s*=?\s*$/, '')
    .replace(/[\s:;\-=\[\]]+$/g, '')
    // Isolated low-confidence characters after the numeric columns are common
    // Tesseract artifacts and are not part of the product name.
    .replace(/\s+[Ii](?:\s+[^A-Za-z0-9]+)*$/g, '')
    .replace(/\s+[a-z]$/g, '')
    .trim();
  // After stripping the numeric columns a real product name must remain.
  if (!hasNameLikeWord(name)) return null;
  const sourceTokens = [...pendingLines.flatMap((entry) => entry.tokens), ...anchorLines.flatMap((entry) => entry.tokens)];
  const lineConfidence = confidence(sourceTokens, 0.7);
  return {
    id: `parsed-item-${index + 1}`,
    name: { value: name, confidence: lineConfidence, sourceTokens },
    quantity: { value: quantity, confidence: quantity ? lineConfidence : 0.25, sourceTokens },
    unitPrice: { value: unitPrice, confidence: unitPrice ? (source === 'ocr' ? lineConfidence : lineConfidence * 0.82) : 0.1, sourceTokens, source },
    totalPrice: { value: totalEntry.parsed.value, confidence: lineConfidence, sourceTokens },
  };
}

function money(entry: { token: OCRToken; parsed: NonNullable<ReturnType<typeof parseMoney>> }, source: 'ocr' | 'derived' = 'ocr'): MonetaryValue {
  return { value: entry.parsed.value, source, confidence: confidence([entry.token]), sourceTokens: [entry.token] };
}

/**
 * Receipts often print an aggregate GST line alongside its CGST/SGST halves.
 * Counting all three would double the tax, so the aggregate is dropped.
 *
 * At least three components are required: with exactly two, "one equals the sum
 * of the others" is trivially true for any equal pair — and an equal pair is
 * precisely what a normal CGST + SGST split looks like.
 */
function taxTotalForReconciliation(components: TaxComponent[]) {
  const total = components.reduce((sum, component) => sum + component.amount, 0);
  if (components.length < 3) return total;
  const aggregate = components.find((component) => {
    const detailSum = components.filter((other) => other !== component).reduce((sum, other) => sum + other.amount, 0);
    return Math.abs(component.amount - detailSum) <= 1;
  });
  return aggregate ? total - aggregate.amount : total;
}

export function parseReceipt(result: OCRResult): ParsedBill {
  const lines = detectLines(result.tokens);
  const visualLines = lines.length ? lines : fallbackLines(result.text);
  const columns = detectNumericColumnsDetailed(visualLines);
  const amountColumn = detectAmountColumn(visualLines);
  // Tolerance scales with text size so it survives the image stage's upscaling.
  const columnTolerance = Math.max(24, (result.imageWidth ?? 1000) * 0.045);
  const diagnostics: ParsedBill['diagnostics'] = { lines: [], ignoredLines: [], warnings: [], candidateTotals: [], numericColumns: columns.map((column) => column.center) };

  /**
   * A genuine item row prints its total in the amount column. A wrapped
   * description ("Red Cotta" above "Pizza - Mini 1 260.00") carries no such
   * value, so anything OCR found on it is noise rather than a price — which is
   * what previously turned each wrapped line into its own phantom item.
   */
  const hasAmountInColumn = (line: OCRLine) => {
    const entries = amountsOf(line);
    if (!entries.length) return false;
    if (amountColumn === null) return true;
    return entries.some((entry) => {
      const box = toBoundingBox(entry.token?.boundingBox);
      if (!entry.token?.boundingBox) return true;
      return Math.abs(box.x + box.width - amountColumn) <= columnTolerance;
    });
  };
  const classified: Array<{ line: OCRLine; section: ReceiptSection; confidence: number; itemHeader: boolean }> = [];
  let seenSummary = false;
  for (const line of visualLines) {
    const classification = classifyLine(line, seenSummary);
    if (classification.itemHeader) {
      // The column header opens the item region, so anything above it that
      // looked like a summary was a document title. "Cash Memo" printed as a
      // heading otherwise flips the parser into summary mode before the first
      // item and every row below is discarded as footer text.
      seenSummary = false;
    } else if (SUMMARY_SECTIONS.includes(classification.section) && amountsOf(line).length > 0) {
      // A summary label with no amount on it is a heading, not a summary row.
      seenSummary = true;
    }
    classified.push({ line, ...classification });
    diagnostics.lines.push({ text: line.text, classification: classification.section, confidence: classification.confidence });
  }

  const items: ParsedBillItem[] = [];
  let inItems = false;
  let pendingLines: OCRLine[] = [];
  // When the receipt shows a column header, everything above it is metadata by
  // construction, so item rows are confined to the region after it. Receipts
  // whose header OCR destroyed fall back to the looser per-line rule rather
  // than losing every item.
  const hasItemHeader = classified.some((entry) => entry.itemHeader);
  for (let i = 0; i < classified.length; i += 1) {
    const current = classified[i];
    // Only the column-header row opens the item region. Treating every 'header'
    // line as an opener let receipt metadata switch item parsing back on.
    if (current.itemHeader) { inItems = true; pendingLines = []; continue; }
    if (current.section === 'header') {
      pendingLines = [];
      diagnostics.ignoredLines.push(current.line.text);
      continue;
    }
    if (SUMMARY_SECTIONS.includes(current.section) || current.section === 'footer') {
      inItems = false;
      continue;
    }
    // A bare-numeric line only closes out an item when its own number is
    // column-aligned with where amounts actually sit on this receipt. That
    // geometric check is what tells apart a trailing "260.00" (in the amount
    // column ⇒ the item's total) from an intermediate "1" printed off to the
    // side (a quantity awaiting a later amount, not yet the anchor) — without
    // it, a bare number could only ever be interpreted as "the total," making
    // every mid-sequence quantity-only line wrongly close out the item early.
    const isBareAnchor = (entry: typeof current) => entry.section === 'unknown' && isBareNumericLine(entry.line) && hasAmountInColumn(entry.line);
    const isItemAnchor = current.section === 'item' && hasAmountInColumn(current.line);
    const likelyRow = (isItemAnchor || isBareAnchor(current)) && (!hasItemHeader || inItems);
    if (likelyRow) {
      // A narrow receipt can print quantity, rate, and total as three separate
      // bare-numeric lines. Group a run of consecutive ones together — a
      // single bare-numeric anchor could otherwise only ever be read as "the
      // total," which would close the item on the very first of them (a
      // quantity) instead of waiting for the real total that follows.
      const anchorLines = [current.line];
      while (isBareAnchor(current) && i + 1 < classified.length && isBareAnchor(classified[i + 1])) {
        i += 1;
        anchorLines.push(classified[i].line);
      }
      const parsed = parseItem(anchorLines, pendingLines, items.length);
      if (parsed) items.push(parsed); else diagnostics.ignoredLines.push(...anchorLines.map((entry) => entry.text));
      pendingLines = [];
    } else if ((inItems || !seenSummary) && !isMetadataLine(current.line.text)
      && (hasNameLikeWord(current.line.text) || isBareNumericLine(current.line))) {
      pendingLines.push(current.line);
    } else if (current.section === 'unknown') diagnostics.ignoredLines.push(current.line.text);
  }

  const taxComponents: TaxComponent[] = [];
  const chargeComponents: ChargeComponent[] = [];
  const adjustments: Adjustment[] = [];
  let subtotal: MonetaryValue | null = null;
  const totals: TotalCandidate[] = [];
  for (const entry of classified) {
    const amount = amountsOf(entry.line).at(-1);
    if (!amount) continue;
    const label = labelOf(entry.line) || entry.line.text;
    const record = { label, amount: amount.parsed.value, confidence: confidence([amount.token]), sourceTokens: [amount.token] };
    if (entry.section === 'subtotal' && !subtotal) subtotal = money(amount);
    if (entry.section === 'tax') taxComponents.push(record);
    if (entry.section === 'service_charge') chargeComponents.push(record);
    if (entry.section === 'discount') adjustments.push({ ...record, amount: -Math.abs(record.amount) });
    if (entry.section === 'adjustment') adjustments.push(record);
    if (entry.section === 'total') totals.push(record);
    if (entry.section === 'payment' && /\b(?:cash|paid|amount\s*due)\b/i.test(entry.line.text)) totals.push({ ...record, confidence: record.confidence * 0.72 });
  }
  if (!subtotal && items.length) {
    subtotal = { value: items.reduce((sum, item) => sum + (item.totalPrice.value ?? 0), 0), source: 'derived', confidence: 0.65, sourceTokens: [] };
  }
  diagnostics.candidateTotals = totals;
  const total = totals.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  const expected = subtotal ? subtotal.value + taxTotalForReconciliation(taxComponents) + chargeComponents.reduce((sum, component) => sum + component.amount, 0) + adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0) : null;
  const difference = expected !== null && total ? total.amount - expected : null;
  const reconciliation = { expectedTotal: expected, extractedTotal: total?.amount ?? null, difference, status: expected === null || !total ? 'insufficient_data' as const : Math.abs(difference ?? 0) <= 1 ? 'match' as const : 'mismatch' as const };
  if (reconciliation.status === 'mismatch') diagnostics.warnings.push(`Summary values differ from the selected total by ${difference} minor units.`);

  // There is deliberately no "re-parse the plain text and keep whichever found
  // more items" fallback here. It used to swap in a second, unrelated item list
  // after the summary had already been computed, so a bill could report a
  // subtotal derived from items it no longer contained. More items is also not
  // the same as better items — the text path's extras were mostly metadata.
  // When tokens carry no geometry, `fallbackLines` already handles it upstream.
  return { currency: result.text.match(/[₹]/) ? 'INR' : result.text.match(/\$/) ? 'USD' : null, items, subtotal, taxComponents, chargeComponents, adjustments, total: total ? { value: total.amount, source: 'ocr', confidence: total.confidence, sourceTokens: total.sourceTokens } : null, reconciliation, diagnostics };
}
