import { ReceiptSection } from '../models';

export type KeywordRule = {
  section: ReceiptSection;
  pattern: RegExp;
  confidence: number;
};

/**
 * Ordered summary keyword groups. The first match wins, so specific labels must
 * precede generic ones — "grand total" before a bare "total", and every explicit
 * charge before the catch-alls.
 *
 * Kept in one place so labels can be extended for new receipt formats without
 * touching classification logic (spec §10, §14).
 */
export const SUMMARY_KEYWORDS: KeywordRule[] = [
  { section: 'subtotal', pattern: /\b(?:sub\s*total|food\s*total|net\s*amount|net\s*total|items?\s*total)\b/i, confidence: 0.96 },
  { section: 'tax', pattern: /\b(?:tax(?:es)?|[csi]?gst|vat|service\s*tax)\b/i, confidence: 0.96 },
  { section: 'service_charge', pattern: /\b(?:service\s*(?:charge|fee)|delivery\s*(?:charge|fee)|pack(?:ing|aging)\s*(?:charge|fee)?|container\s*charge)\b/i, confidence: 0.96 },
  { section: 'discount', pattern: /\b(?:discount|promo(?:tion)?|coupon|less)\b/i, confidence: 0.96 },
  { section: 'adjustment', pattern: /\b(?:round(?:ing)?\s*off|rounding|adjustment)\b/i, confidence: 0.96 },
  { section: 'total', pattern: /\b(?:grand\s*total|amount\s*due|total\s*invoice(?:\s*value)?|final\s*total|net\s*payable|total)\b/i, confidence: 0.92 },
  { section: 'payment', pattern: /\b(?:cash|card|visa|mastercard|upi|payment|paid|change|tender|balance)\b/i, confidence: 0.9 },
  { section: 'footer', pattern: /\b(?:thank\s*you|visit\s*again|guest\s*check|comments?|feedback|terms|prices?\s*incl)\b/i, confidence: 0.9 },
];

/**
 * Receipt metadata: never a purchased item, however many numbers it carries.
 *
 * This exists because "has letters and has digits" describes a table number, a
 * phone number, a GSTIN and a date just as well as it describes an item row.
 * Without an explicit exclusion list those lines become bill items with
 * plausible-looking prices, which is the single worst failure mode here — a
 * fabricated item silently changes what everyone pays.
 */
export const METADATA_PATTERNS: RegExp[] = [
  /\b(?:table|tbl|cover|cvr|guest|server|waiter|waitress|cashier|steward|counter|host)\b/i,
  /\b(?:gstin|tin|fssai|cin|pan|vat\s*no)\b/i,
  /\b(?:phone|ph\.?\s*no|tel|mobile|contact|e-?mail|www|http)\b/i,
  /\b(?:address|street|road|floor|nagar|layout|opp\.?|near)\b/i,
  /\b(?:sequence|terminal|machine|m\/c|register|till|device)\b/i,
  /\b(?:date|dated|time)\b/i,
  /\b(?:bill|invoice|order|token|receipt|check|kot|slip)\s*(?:no|num|number|#)/i,
  /\b(?:no|num|number)\s*[.:#]/i,
  // A "#" immediately followed by an identifier value.
  /#\s*:?\s*\w/,
  // Dates and clock times in any common ordering.
  /\b\d{1,4}[-/]\d{1,2}[-/]\d{2,4}\b/,
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/,
];

/**
 * Mixed letter-and-digit runs of any length are the signature of an identifier
 * (`29ABLPH1358N323`, `C8/2026-27/T1-16915`), not of a product name. Short ones
 * are allowed so genuine names like "7UP" survive.
 */
const IDENTIFIER_TOKEN = /[A-Za-z0-9]{6,}/;

function looksLikeIdentifier(text: string) {
  return text.split(/[\s,;|()[\]{}]+/).some((token) => {
    if (!IDENTIFIER_TOKEN.test(token)) return false;
    return /[A-Za-z]/.test(token) && /\d/.test(token);
  });
}

export function isMetadataLine(text: string) {
  return METADATA_PATTERNS.some((pattern) => pattern.test(text)) || looksLikeIdentifier(text);
}

export function matchSummaryKeyword(text: string): KeywordRule | null {
  return SUMMARY_KEYWORDS.find((rule) => rule.pattern.test(text)) ?? null;
}

/** The column-header row that introduces the item region. */
export function isItemHeaderLine(text: string) {
  const hasSubject = /\b(?:items?|descriptions?|particulars?|product)\b/i.test(text);
  const hasColumn = /\b(?:qty|quantity|rate|price|amount|amt|value)\b/i.test(text);
  // OCR frequently mangles the first header word while the numeric column labels
  // survive, so a qty-then-amount pairing is accepted on its own.
  const hasColumnPair = /\b(?:qty|quantity|oty|qly)\b.*\b(?:rate|price|amount|amt|value)\b/i.test(text);
  return (hasSubject && hasColumn) || hasColumnPair;
}

/** A product name needs a real word, not stray OCR characters like "L D #: al". */
export function hasNameLikeWord(text: string) {
  return /[A-Za-z]{3,}/.test(text);
}
