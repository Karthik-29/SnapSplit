import { BillItem, OCRResult, OCRToken } from './models';

const ignoredLabels = ['subtotal', 'tax', 'total', 'gst', 'service charge', 'discount', 'service', 'charge', 'amount due', 'grand total', 'food total', 'total taxes'];

function normalizeNumber(value: string): number | null {
  const cleaned = value
    .replace(/[₹$€£,]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9.]/g, '')
    .trim();
  if (!cleaned || !/[0-9]/.test(cleaned)) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractNumberFromToken(token: string): number | null {
  const decimalMatches = token.match(/\d+\.\d+/g);
  const integerMatches = token.match(/\d+/g);
  const matches = decimalMatches || integerMatches;
  if (!matches || matches.length === 0) {
    return null;
  }
  return normalizeNumber(matches[matches.length - 1]);
}

function tokenLooksLikeQuantity(token: string): boolean {
  return /^\d+$/.test(token.replace(/[₹$€£]/g, ''));
}

function isItemHeaderLine(lowerLine: string): boolean {
  const hasQty = lowerLine.includes('qty');
  const hasRate = lowerLine.includes('rate');
  const hasAmount = lowerLine.includes('amount');
  const hasPrice = lowerLine.includes('price');

  if (hasQty && (hasRate || hasAmount || hasPrice)) {
    return true;
  }

  if (lowerLine.includes('item') && (hasQty || hasAmount || hasPrice)) {
    return true;
  }

  if (lowerLine.includes('particulars') && hasQty) {
    return true;
  }

  return false;
}

function parseItemLine(line: string): BillItem | null {
  const cleanedLine = line
    .replace(/[“”‘’"'`]/g, ' ')
    .replace(/[-_]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedLine) {
    return null;
  }

  const lowerTrimmed = cleanedLine.toLowerCase();
  if (
    lowerTrimmed.startsWith('rs ') ||
    lowerTrimmed.includes('includes') ||
    lowerTrimmed.includes('total taxes') ||
    lowerTrimmed.includes('thank you') ||
    lowerTrimmed.includes('guest check') ||
    lowerTrimmed.includes('server') ||
    lowerTrimmed.includes('table:') ||
    lowerTrimmed.includes('sequence #:') ||
    lowerTrimmed.includes('id #:') ||
    lowerTrimmed.includes('subtotal') ||
    lowerTrimmed.includes('grand total') ||
    lowerTrimmed.includes('gstin') ||
    lowerTrimmed.includes('visit again')
  ) {
    return null;
  }

  const tokens = cleanedLine.split(' ');
  const numericEntries = tokens
    .map((token, index) => ({ token, index, value: extractNumberFromToken(token) }))
    .filter((entry) => entry.value !== null);

  if (numericEntries.length === 0) {
    return null;
  }

  const lastEntry = numericEntries[numericEntries.length - 1];
  const totalPrice = lastEntry.value as number;
  const totalCents = Math.round(totalPrice * 100);

  const rowPrefix = tokens[0];
  const hasRowNumber = /^\d+$/.test(rowPrefix) && tokens.length > 3;
  const startIndex = hasRowNumber ? 1 : 0;

  const chooseQuantityCandidate = (entry: { token: string; index: number; value: number }) => {
    const maybeQty = entry.value;
    if (!Number.isInteger(maybeQty) || maybeQty <= 0 || maybeQty > 100) {
      return false;
    }
    if (!tokenLooksLikeQuantity(entry.token)) {
      return false;
    }
    return totalCents % maybeQty === 0;
  };

  let quantity = 1;
  let quantityIndex = -1;

  if (hasRowNumber && numericEntries.length >= 3) {
    const candidate = numericEntries[1];
    if (chooseQuantityCandidate(candidate)) {
      quantity = candidate.value;
      quantityIndex = candidate.index;
    }
  } else if (numericEntries.length === 3) {
    const candidate = numericEntries[0];
    if (chooseQuantityCandidate(candidate)) {
      quantity = candidate.value;
      quantityIndex = candidate.index;
    }
  } else if (numericEntries.length >= 3) {
    const candidate = numericEntries[numericEntries.length - 2];
    if (chooseQuantityCandidate(candidate)) {
      quantity = candidate.value;
      quantityIndex = candidate.index;
    }
  }

  const nameEndIndex = quantityIndex >= 0 ? quantityIndex : lastEntry.index;
  let itemNameTokens = tokens.slice(startIndex, nameEndIndex);

  if (itemNameTokens.length === 0 && quantityIndex < 0) {
    itemNameTokens = tokens.slice(startIndex, lastEntry.index);
  }

  if (itemNameTokens.length === 0) {
    return null;
  }

  while (
    itemNameTokens.length > 1 &&
    (/^[^A-Za-z0-9]*\d[\d\W_]*$/.test(itemNameTokens[itemNameTokens.length - 1]) ||
      /^[\W_]+$/.test(itemNameTokens[itemNameTokens.length - 1]) ||
      /^[a-z]$/.test(itemNameTokens[itemNameTokens.length - 1]))
  ) {
    itemNameTokens.pop();
  }

  let itemName = itemNameTokens.join(' ').trim();
  itemName = itemName.replace(/\s*\[[^\]]*(?:\]|$)/g, '');
  itemName = itemName.replace(/\s+[A-Za-z]$/, '');
  itemName = itemName.replace(/\s+\d+$/, '');
  itemName = itemName.replace(/[\W_]+$/g, '').trim();
  itemName = itemName.replace(/\s{2,}/g, ' ');

  if (!itemName) {
    return null;
  }

  const lowerLabel = itemName.toLowerCase();
  if (ignoredLabels.some((ignored) => lowerLabel.startsWith(ignored))) {
    return null;
  }

  if (quantity <= 0 || totalPrice <= 0) {
    return null;
  }

  const unitPrice = Number((totalPrice / quantity).toFixed(2));
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    name: itemName,
    quantity,
    unitPrice,
    totalPrice,
  };
}

function findItemSection(lines: string[]): string[] {
  const lowerLines = lines.map((line) => line.toLowerCase());
  const headerIndex = lowerLines.findIndex((line) => isItemHeaderLine(line));

  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const endIndex = lines.findIndex((line, idx) => idx >= startIndex && getSummaryAmount(line) !== null);
  return lines.slice(startIndex, endIndex >= 0 ? endIndex : lines.length);
}

function getSummaryAmount(line: string): { type: 'subtotal' | 'total' | 'tax'; amount: number } | null {
  let normalized = line.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  normalized = normalized.replace(/(\d+)\s*[.,]\s*(\d+)/g, '$1.$2');
  normalized = normalized.replace(/\s+:/g, ':');

  const tokens = normalized.split(' ');
  const labelTokens = tokens.filter((token) => !/[0-9₹$€£,.]/.test(token));
  const label = labelTokens.join(' ').toLowerCase().replace(/[:.]+$/g, '').trim();
  const amountMatches = normalized.match(/[0-9]+(?:\s*[.,]\s*[0-9]+)*/g);
  if (!amountMatches || amountMatches.length === 0) {
    return null;
  }

  const amountToken = amountMatches[amountMatches.length - 1].replace(/\s+/g, '');
  const amount = normalizeNumber(amountToken);
  if (amount === null) {
    return null;
  }

  if (/\b(tax|gst|vat|service[\s-]*charge|service|charge|fee)\b/.test(label)) {
    return { type: 'tax', amount };
  }

  if (/^(sub[\s-]*total|subtotal|sub total|food total)$/.test(label)) {
    return { type: 'subtotal', amount };
  }

  if (/\b(amount due|grand total|total)\b/.test(label)) {
    return { type: 'total', amount };
  }

  return null;
}

function groupTokensIntoLines(tokens: OCRToken[]): string[] {
  const wordsWithBoxes = tokens
    .filter((token) => token.text.trim())
    .map((token) => ({
      token,
      centerY: token.boundingBox ? (token.boundingBox[1] + token.boundingBox[3]) / 2 : 0,
      x0: token.boundingBox ? token.boundingBox[0] : 0,
    }))
    .sort((a, b) => a.centerY - b.centerY || a.x0 - b.x0);

  const rows: Array<{ y: number; words: OCRToken[] }> = [];

  wordsWithBoxes.forEach(({ token, centerY }) => {
    const row = rows.find((current) => Math.abs(current.y - centerY) < 12);
    if (row) {
      row.words.push(token);
    } else {
      rows.push({ y: centerY, words: [token] });
    }
  });

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) =>
      row.words
        .sort((a, b) => {
          const ax = a.boundingBox ? a.boundingBox[0] : 0;
          const bx = b.boundingBox ? b.boundingBox[0] : 0;
          return ax - bx;
        })
        .map((word) => word.text)
        .join(' ')
    );
}

function parseLines(lines: string[]): BillItem[] {
  const items: BillItem[] = [];
  lines.forEach((line) => {
    const parsed = parseItemLine(line);
    if (parsed) {
      items.push(parsed);
    }
  });
  return items;
}

export function parseReceiptData(result: OCRResult) {
  const normalizedTextLines = result.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let subtotal: number | undefined;
  let total: number | undefined;
  let hasSummaryLine = false;

  normalizedTextLines.forEach((line) => {
    const summary = getSummaryAmount(line);
    if (!summary) {
      return;
    }

    hasSummaryLine = true;
    if (summary.type === 'subtotal') {
      subtotal = summary.amount;
    } else if (summary.type === 'total') {
      total = summary.amount;
    }
  });

  const itemLines = findItemSection(normalizedTextLines);
  let items = parseLines(itemLines);

  if (items.length === 0 && result.tokens && result.tokens.length > 0) {
    const fallbackLines = groupTokensIntoLines(result.tokens);
    const fallbackItemLines = findItemSection(fallbackLines);
    items = parseLines(fallbackItemLines);
  }

  return {
    items,
    subtotal,
    total,
    rawText: result.text,
  };
}

export function parseReceiptLines(result: OCRResult): BillItem[] {
  return parseReceiptData(result).items;
}
