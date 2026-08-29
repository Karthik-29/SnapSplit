import { BoundingBox, RgbaImage } from '../models';
import { createRgbaImage } from './crop';

export type ReceiptQuadrilateral = { topLeft: [number, number]; topRight: [number, number]; bottomRight: [number, number]; bottomLeft: [number, number] };

/** Basic geometry guard for callers that supply a document quadrilateral. */
export function isReliableQuadrilateral(points: ReceiptQuadrilateral, image: RgbaImage): boolean {
  const xs = [points.topLeft[0], points.topRight[0], points.bottomRight[0], points.bottomLeft[0]];
  const ys = [points.topLeft[1], points.topRight[1], points.bottomRight[1], points.bottomLeft[1]];
  const box: BoundingBox = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  return box.width > image.width * 0.15 && box.height > image.height * 0.15 && box.x >= 0 && box.y >= 0 && box.x + box.width <= image.width && box.y + box.height <= image.height;
}

function distance([ax, ay]: [number, number], [bx, by]: [number, number]) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Rectifies a reliable quadrilateral using deterministic bilinear sampling.
 * The caller should use `isReliableQuadrilateral` first and fall back to the
 * unmodified image when it returns false.
 */
export function perspectiveCorrect(source: RgbaImage, points: ReceiptQuadrilateral): RgbaImage {
  if (!isReliableQuadrilateral(points, source)) return source;
  const width = Math.max(1, Math.round((distance(points.topLeft, points.topRight) + distance(points.bottomLeft, points.bottomRight)) / 2));
  const height = Math.max(1, Math.round((distance(points.topLeft, points.bottomLeft) + distance(points.topRight, points.bottomRight)) / 2));
  const output = createRgbaImage(width, height);
  for (let y = 0; y < height; y += 1) {
    const v = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = width === 1 ? 0 : x / (width - 1);
      const topX = points.topLeft[0] + (points.topRight[0] - points.topLeft[0]) * u;
      const topY = points.topLeft[1] + (points.topRight[1] - points.topLeft[1]) * u;
      const bottomX = points.bottomLeft[0] + (points.bottomRight[0] - points.bottomLeft[0]) * u;
      const bottomY = points.bottomLeft[1] + (points.bottomRight[1] - points.bottomLeft[1]) * u;
      const sourceX = Math.max(0, Math.min(source.width - 1, Math.round(topX + (bottomX - topX) * v)));
      const sourceY = Math.max(0, Math.min(source.height - 1, Math.round(topY + (bottomY - topY) * v)));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      output.data.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return output;
}
