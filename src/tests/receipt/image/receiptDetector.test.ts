import { describe, expect, it } from 'vitest';
import { detectReceiptRegion } from '../../../receipt/image/receiptDetector';
import { RgbaImage } from '../../../receipt/models';

function filledImage(width: number, height: number, red: number, green = red, blue = red): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = red;
    data[index + 1] = green;
    data[index + 2] = blue;
    data[index + 3] = 255;
  }
  return { data, width, height };
}

function drawRect(image: RgbaImage, left: number, top: number, width: number, height: number, red: number, green = red, blue = red) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const index = (y * image.width + x) * 4;
      image.data[index] = red;
      image.data[index + 1] = green;
      image.data[index + 2] = blue;
    }
  }
}

describe('receipt region detector', () => {
  it('finds a bright receipt against a dark background', () => {
    // A dark scene with a bright sheet of paper in it, which is what a phone
    // photo of a receipt on a table actually looks like.
    const image = filledImage(200, 300, 70);
    drawRect(image, 50, 40, 100, 210, 244);
    // Printed lines on the paper.
    drawRect(image, 60, 70, 80, 4, 30);
    drawRect(image, 60, 100, 80, 4, 30);
    drawRect(image, 60, 130, 70, 4, 30);

    const candidate = detectReceiptRegion(image);

    expect(candidate.reason).not.toBe('full_image');
    expect(candidate.boundingBox.x).toBeLessThanOrEqual(55);
    expect(candidate.boundingBox.y).toBeLessThanOrEqual(45);
    expect(candidate.boundingBox.width).toBeLessThan(image.width);
    expect(candidate.confidence).toBeGreaterThan(0.6);
  });

  it('ignores a bright but strongly coloured region', () => {
    // Skin and painted surfaces can be as bright as paper; saturation is what
    // separates them, so a vivid block must not be mistaken for a receipt.
    const image = filledImage(200, 300, 70);
    drawRect(image, 50, 40, 100, 210, 250, 140, 40);

    const candidate = detectReceiptRegion(image);

    expect(candidate.reason).toBe('full_image');
  });

  it('falls back to the full image when the whole frame is paper', () => {
    const candidate = detectReceiptRegion(filledImage(120, 160, 230));

    expect(candidate.reason).toBe('full_image');
    expect(candidate.boundingBox).toEqual({ x: 0, y: 0, width: 120, height: 160 });
  });
});
