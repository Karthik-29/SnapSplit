import { describe, expect, it } from 'vitest';
import { parseMoney, parseQuantity } from '../../../receipt/parsing/numberParser';

describe('number parser', () => {
  it('parses money into integer minor units', () => {
    expect(parseMoney('$1,234.50')?.value).toBe(123450);
    expect(parseMoney('Rs 74.50')?.value).toBe(7450);
    expect(parseMoney('Round Off: -0.50')?.value).toBe(-50);
  });

  it('applies OCR correction only in numeric context', () => {
    expect(parseMoney('1O.5O')).toMatchObject({ value: 1050, corrected: true });
    expect(parseMoney('POLLO')).toBeNull();
  });

  it('parses explicit quantities without inventing arbitrary numbers', () => {
    expect(parseQuantity('2.00')).toBe(2);
    expect(parseQuantity('1,5')).toBeNull();
  });
});
