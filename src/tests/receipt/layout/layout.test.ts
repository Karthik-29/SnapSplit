import { describe, expect, it } from 'vitest';
import { detectNumericColumns } from '../../../receipt/layout/columnDetection';
import { detectLines } from '../../../receipt/layout/lineDetection';
import { OCRToken } from '../../../receipt/models';

function token(text: string, x: number, y: number): OCRToken {
  return { text, boundingBox: { x, y, width: text.length * 8, height: 14 }, confidence: 90 };
}

describe('layout reconstruction', () => {
  it('orders tokens into logical lines', () => {
    const lines = detectLines([
      token('100.00', 220, 42),
      token('DOSA', 72, 40),
      token('MASALA', 10, 41),
      token('Total', 10, 80),
      token('100.00', 220, 80),
    ]);

    expect(lines.map((line) => line.text)).toEqual(['MASALA DOSA 100.00', 'Total 100.00']);
  });

  it('clusters right-aligned numeric columns', () => {
    const lines = detectLines([
      token('Item', 10, 10), token('1', 150, 10), token('100.00', 220, 10),
      token('Item', 10, 32), token('2', 150, 32), token('200.00', 220, 32),
    ]);

    expect(detectNumericColumns(lines).length).toBeGreaterThanOrEqual(2);
  });
});
