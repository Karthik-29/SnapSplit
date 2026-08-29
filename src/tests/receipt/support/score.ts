import { ExpectedReceiptFixture } from '../fixtures/realReceiptFixtures';

/**
 * Accuracy measurement for the receipt pipeline.
 *
 * `scoreOcrText` deliberately looks only at raw OCR output, with no parsing
 * involved. It answers the one question the image stage controls: did the
 * characters the bill actually needs survive into the text at all? A parser can
 * never recover an item name or amount that OCR did not produce, so this is the
 * metric to move when tuning preprocessing and region detection.
 */

export function normalizeText(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** A word counts as present if some OCR word is within a ~25% character budget. */
function wordFound(word: string, haystack: string[]) {
  const budget = word.length <= 4 ? 1 : Math.floor(word.length * 0.25);
  return haystack.some((candidate) => Math.abs(candidate.length - word.length) <= budget + 1
    && editDistance(word, candidate) <= budget);
}

export function nameFound(name: string, ocrText: string) {
  const words = normalizeText(name).split(' ').filter((word) => word.length >= 3);
  if (!words.length) return false;
  const haystack = normalizeText(ocrText).split(' ');
  const hits = words.filter((word) => wordFound(word, haystack)).length;
  // Half the significant words is enough: receipts abbreviate and OCR drops one.
  return hits * 2 >= words.length;
}

/**
 * Looks for a minor-unit amount in any plausible printed form.
 *
 * Matching is restricted to whole digit runs and concatenations of *adjacent*
 * runs, so `150.00` still matches when OCR splits it into `150` and `00`, while
 * a bare substring search cannot fabricate a hit out of an unrelated GSTIN.
 */
export function amountFound(amountMinor: number, ocrText: string) {
  const absolute = Math.abs(amountMinor);
  const runs = normalizeText(ocrText).replace(/[^0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const haystack = new Set(runs);
  for (let index = 0; index < runs.length - 1; index += 1) {
    haystack.add(runs[index] + runs[index + 1]);
  }

  const candidates = new Set<string>([String(absolute)]);
  if (absolute % 100 === 0) candidates.add(String(absolute / 100));

  for (const candidate of candidates) {
    if (haystack.has(candidate)) return true;
  }
  return false;
}

export type OcrTextScore = {
  sourceFile: string;
  itemNames: { found: number; total: number };
  itemAmounts: { found: number; total: number };
  summaryAmounts: { found: number; total: number };
  missingNames: string[];
  missingAmounts: string[];
  score: number;
};

export function scoreOcrText(fixture: ExpectedReceiptFixture, ocrText: string): OcrTextScore {
  const missingNames: string[] = [];
  const missingAmounts: string[] = [];

  let namesFound = 0;
  let itemAmountsFound = 0;
  for (const item of fixture.expected.items) {
    if (nameFound(item.name, ocrText)) namesFound += 1; else missingNames.push(item.name);
    if (amountFound(item.totalPrice, ocrText)) itemAmountsFound += 1;
    else missingAmounts.push(`${item.name}=${(item.totalPrice / 100).toFixed(2)}`);
  }

  const summaryTargets: Array<[string, number]> = [
    ['subtotal', fixture.expected.subtotal],
    ['total', fixture.expected.total],
    ...(fixture.expected.taxComponents ?? []).map((tax) => [tax.labelIncludes, tax.amount] as [string, number]),
  ];
  let summaryFound = 0;
  for (const [label, amount] of summaryTargets) {
    if (amountFound(amount, ocrText)) summaryFound += 1;
    else missingAmounts.push(`${label}=${(amount / 100).toFixed(2)}`);
  }

  const found = namesFound + itemAmountsFound + summaryFound;
  const total = fixture.expected.items.length * 2 + summaryTargets.length;

  return {
    sourceFile: fixture.sourceFile,
    itemNames: { found: namesFound, total: fixture.expected.items.length },
    itemAmounts: { found: itemAmountsFound, total: fixture.expected.items.length },
    summaryAmounts: { found: summaryFound, total: summaryTargets.length },
    missingNames,
    missingAmounts,
    score: total ? found / total : 0,
  };
}

export function formatOcrScoreTable(scores: OcrTextScore[]) {
  const rows = scores.map((score) => [
    score.sourceFile.padEnd(24),
    `names ${score.itemNames.found}/${score.itemNames.total}`.padEnd(12),
    `itemAmts ${score.itemAmounts.found}/${score.itemAmounts.total}`.padEnd(15),
    `summary ${score.summaryAmounts.found}/${score.summaryAmounts.total}`.padEnd(14),
    `${(score.score * 100).toFixed(1)}%`,
  ].join(' '));
  const aggregate = scores.reduce((sum, score) => sum + score.score, 0) / Math.max(1, scores.length);
  return [...rows, `${'AGGREGATE'.padEnd(24)} ${(aggregate * 100).toFixed(1)}%`].join('\n');
}

export function aggregateScore(scores: OcrTextScore[]) {
  return scores.reduce((sum, score) => sum + score.score, 0) / Math.max(1, scores.length);
}
