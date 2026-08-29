import { RgbaImage } from '../models';

/** Canonical "white paper" brightness after correction. */
const TARGET_BACKGROUND = 235;
/** Guards against dividing by a near-zero background in genuinely dark regions. */
const BACKGROUND_FLOOR = 40;
/** Blur radius as a fraction of the image's long edge. */
const BLUR_RADIUS_FRACTION = 0.07;

export type IlluminationOptions = {
  targetBackground?: number;
  backgroundFloor?: number;
  blurRadiusFraction?: number;
  /**
   * Gate correction to only fire where the local background sits below
   * `targetBackground * shadowOnlyThreshold` (a genuine shadow/glare patch);
   * everywhere else is left untouched. Undefined applies correction
   * everywhere, uniformly.
   */
  shadowOnlyThreshold?: number;
};

/**
 * A true sliding-window box blur (separable: one horizontal pass, one
 * vertical pass, each an O(width) running sum per row/column) on a single
 * grayscale channel. Deliberately not a downscale/upscale round-trip through
 * the resize filter: that approach turned out to be highly sensitive to the
 * exact ratio between the image's pixel dimensions and the downscale target,
 * producing sharp, non-physical accuracy swings between neighbouring
 * parameter values on real photos — a sign of a resampling-grid artifact,
 * not a genuine optimum. A direct sliding-window blur varies smoothly with
 * radius instead.
 */
function boxBlur(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1) return values;
  const horizontal = new Float32Array(values.length);
  const windowSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) sum += values[rowStart + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x += 1) {
      horizontal[rowStart + x] = sum / windowSize;
      const nextIn = Math.min(width - 1, x + radius + 1);
      const nextOut = Math.max(0, x - radius);
      sum += values[rowStart + nextIn] - values[rowStart + nextOut];
    }
  }

  const result = new Float32Array(values.length);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += horizontal[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y += 1) {
      result[y * width + x] = sum / windowSize;
      const nextIn = Math.min(height - 1, y + radius + 1);
      const nextOut = Math.max(0, y - radius);
      sum += horizontal[nextIn * width + x] - horizontal[nextOut * width + x];
    }
  }

  return result;
}

/**
 * Flat-field illumination correction: divides each pixel by a heavily
 * blurred estimate of the local background (the paper), then rescales to a
 * canonical brightness.
 *
 * A single global contrast multiplier cannot fix a shadow or glare band — it
 * scales light and dark regions by the same factor, so a shadowed patch stays
 * proportionally dark no matter the multiplier. This instead estimates the
 * slowly-varying illumination itself (a blur radius wide enough to be blind
 * to individual glyphs, only the overall lighting) and divides it out, which
 * cancels the gradient while leaving character strokes intact.
 *
 * Must run on already-grayscale data (R=G=B) — only luminance is corrected.
 */
export function correctIllumination(image: RgbaImage, options: IlluminationOptions = {}): void {
  const targetBackground = options.targetBackground ?? TARGET_BACKGROUND;
  const backgroundFloor = options.backgroundFloor ?? BACKGROUND_FLOOR;
  const blurRadiusFraction = options.blurRadiusFraction ?? BLUR_RADIUS_FRACTION;
  const shadowCutoff = options.shadowOnlyThreshold !== undefined ? targetBackground * options.shadowOnlyThreshold : null;

  const { width, height, data } = image;
  const radius = Math.max(1, Math.round(Math.max(width, height) * blurRadiusFraction));

  const luminance = new Float32Array(width * height);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) luminance[pixel] = data[pixel * 4];

  const background = boxBlur(luminance, width, height, radius);

  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const index = pixel * 4;
    if (shadowCutoff !== null && background[pixel] >= shadowCutoff) continue; // already fine, leave untouched
    const local = Math.max(backgroundFloor, background[pixel]);
    const corrected = (luminance[pixel] * targetBackground) / local;
    data[index] = data[index + 1] = data[index + 2] = corrected;
  }
}
