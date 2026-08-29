import { ReceiptRegionCandidate, RgbaImage } from '../models';

export type DetectedReceiptRegion = ReceiptRegionCandidate;

/**
 * Finds the receipt by looking for what a receipt physically is: a large, bright,
 * low-saturation, roughly solid sheet of paper.
 *
 * The previous detector scored raw edge density, which loses badly on real
 * phone photos — tiled floors, hands and reflections all carry more edge energy
 * than printed text, so the candidate box grew to cover the whole frame and was
 * then rejected for excessive coverage. Paper, by contrast, is separable from
 * almost any background: it is near-white (high luminance) and almost colourless
 * (low saturation), while skin, wood and tiling are one or the other but rarely
 * both.
 *
 * This must run on the COLOUR image, before any grayscale conversion, or the
 * saturation signal is gone.
 */

/** Cells along the longest edge. Coarse enough to be cheap, fine enough to bound text. */
const GRID = 110;
const MAX_SATURATION = 70;
const MIN_COVERAGE = 0.04;
const FULL_FRAME_COVERAGE = 0.92;

function fullImage(image: RgbaImage, confidence = 0): ReceiptRegionCandidate {
  return { boundingBox: { x: 0, y: 0, width: image.width, height: image.height }, confidence, reason: 'full_image' };
}

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

export function detectReceiptRegion(image: RgbaImage): DetectedReceiptRegion {
  const cell = Math.max(4, Math.round(Math.max(image.width, image.height) / GRID));
  const cols = Math.floor(image.width / cell);
  const rows = Math.floor(image.height / cell);
  if (cols < 4 || rows < 4) return fullImage(image);

  const luminance = new Float32Array(cols * rows);
  const saturation = new Float32Array(cols * rows);
  // Sampling every other pixel keeps this linear-ish on large photos without
  // meaningfully changing per-cell averages.
  const step = Math.max(1, Math.floor(cell / 8));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let lumSum = 0;
      let satSum = 0;
      let count = 0;
      const startY = row * cell;
      const startX = col * cell;
      for (let y = startY; y < startY + cell; y += step) {
        for (let x = startX; x < startX + cell; x += step) {
          const offset = (y * image.width + x) * 4;
          const red = image.data[offset];
          const green = image.data[offset + 1];
          const blue = image.data[offset + 2];
          lumSum += red * 0.299 + green * 0.587 + blue * 0.114;
          satSum += Math.max(red, green, blue) - Math.min(red, green, blue);
          count += 1;
        }
      }
      luminance[row * cols + col] = lumSum / count;
      saturation[row * cols + col] = satSum / count;
    }
  }

  // A robust "white point" from the image itself, so the threshold adapts to
  // exposure instead of assuming a fixed brightness.
  const sortedLuminance = [...luminance].sort((a, b) => a - b);
  const whitePoint = percentile(sortedLuminance, 0.95);
  const brightCutoff = Math.max(110, whitePoint * 0.74);

  const paper = new Uint8Array(cols * rows);
  for (let index = 0; index < paper.length; index += 1) {
    paper[index] = luminance[index] >= brightCutoff && saturation[index] <= MAX_SATURATION ? 1 : 0;
  }

  // Largest 4-connected component of paper cells.
  const labels = new Int32Array(cols * rows).fill(-1);
  let best: { size: number; minCol: number; maxCol: number; minRow: number; maxRow: number } | null = null;
  const queue = new Int32Array(cols * rows);

  for (let start = 0; start < paper.length; start += 1) {
    if (!paper[start] || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail += 1] = start;
    labels[start] = start;
    let size = 0;
    let minCol = cols;
    let maxCol = -1;
    let minRow = rows;
    let maxRow = -1;

    while (head < tail) {
      const current = queue[head += 1];
      const col = current % cols;
      const row = (current - col) / cols;
      size += 1;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;

      if (col > 0 && paper[current - 1] && labels[current - 1] === -1) { labels[current - 1] = start; queue[tail += 1] = current - 1; }
      if (col < cols - 1 && paper[current + 1] && labels[current + 1] === -1) { labels[current + 1] = start; queue[tail += 1] = current + 1; }
      if (row > 0 && paper[current - cols] && labels[current - cols] === -1) { labels[current - cols] = start; queue[tail += 1] = current - cols; }
      if (row < rows - 1 && paper[current + cols] && labels[current + cols] === -1) { labels[current + cols] = start; queue[tail += 1] = current + cols; }
    }

    if (!best || size > best.size) best = { size, minCol, maxCol, minRow, maxRow };
  }

  if (!best) return fullImage(image);

  const coverage = best.size / (cols * rows);
  if (coverage < MIN_COVERAGE) return fullImage(image);
  // Effectively the whole frame is paper (a scan or a tight crop): nothing to cut.
  if (coverage > FULL_FRAME_COVERAGE) return fullImage(image, 0.5);

  const boxCols = best.maxCol - best.minCol + 1;
  const boxRows = best.maxRow - best.minRow + 1;
  // Solidity: a real sheet fills its own bounding box; scattered bright specks do not.
  const fill = best.size / (boxCols * boxRows);
  if (fill < 0.55) return fullImage(image, 0.3);

  // The full component box is kept on purpose. Trimming fringe rows by paper
  // density was measured and made things worse: a hand gripping the receipt
  // lowers density over real printed lines, and the trim cut away the totals.
  // One cell of margin so edge glyphs are not clipped.
  const left = Math.max(0, (best.minCol - 1) * cell);
  const top = Math.max(0, (best.minRow - 1) * cell);
  const right = Math.min(image.width, (best.maxCol + 2) * cell);
  const bottom = Math.min(image.height, (best.maxRow + 2) * cell);

  const confidence = Math.min(0.95, 0.28 + fill * 0.5 + Math.min(coverage, 0.4) * 0.5);

  return {
    boundingBox: { x: left, y: top, width: right - left, height: bottom - top },
    confidence,
    reason: fill > 0.72 ? 'document_boundary' : 'text_density',
  };
}
