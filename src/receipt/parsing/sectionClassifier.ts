import { OCRLine, ReceiptSection } from '../models';
import { hasNameLikeWord, isItemHeaderLine, isMetadataLine, matchSummaryKeyword } from './keywordMatcher';

export type LineClassification = {
  section: ReceiptSection;
  confidence: number;
  /** True only for the column-header row that opens the item region. */
  itemHeader: boolean;
};

export function classifyLine(line: OCRLine, seenSummary = false): LineClassification {
  const text = line.text.replace(/\s+/g, ' ').trim();

  // "Total Qty 5" is an item-region summary count, not a monetary total.
  if (/^\s*total\s+(?:qty|quantity)\b/i.test(text)) {
    return { section: 'header', confidence: 0.86, itemHeader: false };
  }

  if (isItemHeaderLine(text)) {
    return { section: 'header', confidence: 0.92, itemHeader: true };
  }

  const keyword = matchSummaryKeyword(text);
  if (keyword) {
    return { section: keyword.section, confidence: keyword.confidence, itemHeader: false };
  }

  // Checked after summary keywords so a legitimate "Total Taxes" line is not
  // discarded for containing a date-like number.
  if (isMetadataLine(text)) {
    return { section: 'header', confidence: 0.8, itemHeader: false };
  }

  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const numbers = (text.match(/\d/g) ?? []).length;

  if (letters > 1 && numbers > 0 && hasNameLikeWord(text) && !seenSummary) {
    return { section: 'item', confidence: 0.62, itemHeader: false };
  }
  if (seenSummary && letters > 3) {
    return { section: 'footer', confidence: 0.5, itemHeader: false };
  }
  return { section: 'unknown', confidence: 0.25, itemHeader: false };
}
