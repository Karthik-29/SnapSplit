import { OCRLine } from '../models';
import { parseMoney } from '../parsing/numberParser';
import { toBoundingBox } from './normalizeTokens';

export type NumericColumn = {
  /** Right edge of the column, where printed amounts align. */
  center: number;
  count: number;
};

function medianTokenHeight(lines: OCRLine[]) {
  const heights = lines
    .flatMap((line) => line.tokens.map((token) => toBoundingBox(token.boundingBox).height))
    .filter((height) => height > 0)
    .sort((a, b) => a - b);
  return heights.length ? heights[Math.floor(heights.length / 2)] : 0;
}

/**
 * Clusters right-aligned numeric tokens into columns.
 *
 * The tolerance is derived from text size rather than fixed in pixels, because
 * the same receipt is OCR'd at whatever resolution the image stage produced; a
 * hardcoded 24px window silently stops clustering once the image is upscaled.
 */
export function detectNumericColumnsDetailed(lines: OCRLine[]): NumericColumn[] {
  const tolerance = Math.max(18, medianTokenHeight(lines) * 1.1);
  const positions = lines.flatMap((line) => line.tokens
    .filter((token) => /\d/.test(token.text) && parseMoney(token.text) !== null)
    .map((token) => {
      const box = toBoundingBox(token.boundingBox);
      return box.x + box.width;
    }))
    .sort((a, b) => a - b);

  const clusters: number[][] = [];
  for (const position of positions) {
    const cluster = clusters.find((values) => Math.abs(values.reduce((sum, value) => sum + value, 0) / values.length - position) <= tolerance);
    if (cluster) cluster.push(position); else clusters.push([position]);
  }

  return clusters
    .filter((values) => values.length >= 2)
    .map((values) => ({
      center: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      count: values.length,
    }));
}

/** Returns stable right-aligned numeric column centers. */
export function detectNumericColumns(lines: OCRLine[]): number[] {
  return detectNumericColumnsDetailed(lines).map((column) => column.center);
}

/**
 * The column carrying line-item totals.
 *
 * Derived from where each line puts its *last* amount, not from every numeric
 * token on the page. Clustering all numerics lets right-margin OCR noise form a
 * dense phantom column further right than the real one, and a gate built on
 * that phantom rejects every genuine item row.
 */
export function detectAmountColumn(lines: OCRLine[]): number | null {
  const edges: number[] = [];
  for (const line of lines) {
    const amounts = line.tokens.filter((token) => /\d/.test(token.text) && parseMoney(token.text) !== null);
    if (!amounts.length) continue;
    const box = toBoundingBox(amounts[amounts.length - 1].boundingBox);
    edges.push(box.x + box.width);
  }
  if (edges.length < 3) return null;

  const tolerance = Math.max(20, medianTokenHeight(lines) * 1.5);
  const clusters: number[][] = [];
  for (const edge of edges.sort((a, b) => a - b)) {
    const cluster = clusters.find((values) => Math.abs(values.reduce((sum, value) => sum + value, 0) / values.length - edge) <= tolerance);
    if (cluster) cluster.push(edge); else clusters.push([edge]);
  }

  const ranked = [...clusters].sort((a, b) => b.length - a.length);
  const best = ranked[0];
  const runnerUp = ranked[1];

  // Fail safe. On a skewed or noisy photo the right margin can produce a cluster
  // as dense as the real amount column, and committing to the wrong one rejects
  // every genuine item row — a far worse outcome than not having a column at
  // all. A column is only reported when it clearly dominates; otherwise callers
  // fall back to their non-geometric rule.
  const dominant = best.length >= 3 && (!runnerUp || best.length >= runnerUp.length * 1.5);
  if (!dominant) return null;

  return Math.round(best.reduce((sum, value) => sum + value, 0) / best.length);
}
