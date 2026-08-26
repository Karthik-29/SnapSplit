import { BoundingBox, OCRLine, OCRToken } from '../models';
import { normalizedTokens, toBoundingBox } from './normalizeTokens';

function unionBox(tokens: OCRToken[]): BoundingBox {
  const boxes = tokens.map((token) => toBoundingBox(token.boundingBox));
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Rebuilds visual lines using vertical overlap instead of OCR text newlines.
 *
 * Row membership is tested against the row's running mean centre with a
 * tolerance derived from the page's median token height. Both details matter:
 * measuring against the row's *union box* instead created a feedback loop —
 * absorbing one tall token grew the row's height, which widened the tolerance,
 * which absorbed more tokens — and on a slightly skewed photo that collapsed
 * four separate item rows into a single unparseable line.
 */
export function detectLines(input: OCRToken[]): OCRLine[] {
  const tokens = normalizedTokens(input).filter((token) => token.boundingBox);
  if (!tokens.length) return [];

  const entries = tokens
    .map((token) => {
      const box = toBoundingBox(token.boundingBox);
      return { token, box, center: box.y + box.height / 2 };
    })
    .sort((a, b) => a.center - b.center || a.box.x - b.box.x);

  const heights = entries.map((entry) => entry.box.height).filter((height) => height > 0).sort((a, b) => a - b);
  const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 12;
  const tolerance = Math.max(6, medianHeight * 0.6);

  const rows: Array<{ tokens: OCRToken[]; centerSum: number; count: number }> = [];
  for (const entry of entries) {
    // Entries arrive sorted by vertical centre, so only the most recent rows can
    // still be in range; scanning from the end keeps this near-linear.
    let target: (typeof rows)[number] | undefined;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      const distance = Math.abs(entry.center - row.centerSum / row.count);
      if (distance <= tolerance) { target = row; break; }
      if (entry.center - row.centerSum / row.count > tolerance * 4) break;
    }
    if (target) {
      target.tokens.push(entry.token);
      target.centerSum += entry.center;
      target.count += 1;
    } else {
      rows.push({ tokens: [entry.token], centerSum: entry.center, count: 1 });
    }
  }

  return rows.map((row) => {
    const ordered = row.tokens.sort((a, b) => toBoundingBox(a.boundingBox).x - toBoundingBox(b.boundingBox).x);
    return { tokens: ordered, text: ordered.map((token) => token.text).join(' '), boundingBox: unionBox(ordered) };
  }).sort((a, b) => a.boundingBox.y - b.boundingBox.y);
}
