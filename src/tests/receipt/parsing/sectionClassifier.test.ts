import { describe, expect, it } from 'vitest';
import { OCRLine } from '../../../receipt/models';
import { classifyLine } from '../../../receipt/parsing/sectionClassifier';

function line(text: string): OCRLine {
  return { text, tokens: [{ text }], boundingBox: { x: 0, y: 0, width: text.length * 8, height: 16 } };
}

describe('section classifier', () => {
  it('classifies summary, payment, and item-like rows deterministically', () => {
    expect(classifyLine(line('Sub Total: 1490.00')).section).toBe('subtotal');
    expect(classifyLine(line('CGST @2.5 37.25')).section).toBe('tax');
    expect(classifyLine(line('Round Off: 0.50')).section).toBe('adjustment');
    expect(classifyLine(line('CASH Rs 178.00')).section).toBe('payment');
    expect(classifyLine(line('MASALA DOSA 2 75 150')).section).toBe('item');
  });

  it('scrutinizes text after a summary section as footer-like metadata', () => {
    expect(classifyLine(line('Guest Check 998877'), true).section).toBe('footer');
  });
});
