import { BillItem, OCRResult, OCRToken } from './models';

const ignoredLabels = ['subtotal', 'tax', 'total', 'gst', 'service charge', 'discount', 'service', 'charge'];

function normalizeNumber(value: string): number | null {
  const cleaned = value.replace(/[₹$€£]/g, '').replace(/,/g, '').trim();
  if (!cleaned || !/[0-9]/.test(cleaned)) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseItemLine(line: string): BillItem | null {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return null;
  }

  const tokens = trimmed.split(' ');
  const numericTokens = tokens.filter((token) => /[0-9₹$€£,.]/.test(token));
  if (numericTokens.length === 0) {
    return null;
  }

  const candidateNumbers = numericTokens.map(normalizeNumber).filter((value): value is number => value !== null);
  if (candidateNumbers.length === 0) {
    return null;
  }

  let itemName: string;
  let quantity = 1;
  let totalPrice: number;

  if (candidateNumbers.length >= 2) {
    const totalCandidate = candidateNumbers[candidateNumbers.length - 1];
    const quantityCandidate = candidateNumbers[candidateNumbers.length - 2];
    if (Number.isInteger(quantityCandidate) && quantityCandidate > 0) {
      quantity = quantityCandidate;
      totalPrice = totalCandidate;
      itemName = tokens.slice(0, tokens.lastIndexOf(numericTokens[numericTokens.length - 2])).join(' ');
    } else {
      totalPrice = totalCandidate;
      itemName = tokens.slice(0, tokens.lastIndexOf(numericTokens[numericTokens.length - 1])).join(' ');
    }
  } else {
    totalPrice = candidateNumbers[0];
    itemName = tokens.slice(0, tokens.lastIndexOf(numericTokens[0])).join(' ');
  }

  const name = itemName.trim();
  if (!name) {
    return null;
  }

  const lowerLabel = name.toLowerCase();
  if (ignoredLabels.some((ignored) => lowerLabel.startsWith(ignored))) {
    return null;
  }

  if (quantity <= 0 || totalPrice <= 0) {
    return null;
  }

  const unitPrice = Math.round(totalPrice / quantity);
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    name,
    quantity,
    unitPrice,
    totalPrice,
  };
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

export function parseReceiptLines(result: OCRResult): BillItem[] {
  const normalizedTextLines = result.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let items = parseLines(normalizedTextLines);
  if (items.length > 0) {
    return items;
  }

  if (result.tokens && result.tokens.length > 0) {
    const fallbackLines = groupTokensIntoLines(result.tokens);
    items = parseLines(fallbackLines);
  }

  return items;
}
