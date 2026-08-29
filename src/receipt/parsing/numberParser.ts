import { Money } from '../models';

export type ParsedNumber = { value: Money; corrected: boolean; currency: string | null };

const currencyPattern = /[₹$€£]|\b(?:rs\.?|inr|usd|eur|gbp)\b/i;

/** Parses a single monetary expression into minor units, only correcting in numeric context. */
export function parseMoney(input: string): ParsedNumber | null {
  const original = input.trim();
  if (!original || !/[0-9OoIl]/.test(original)) return null;
  const negative = /\(|-|\b(?:discount|less)\b/i.test(original);
  let value = original.replace(/[OoIl]/g, (match, offset, fullText) => {
    const previous = fullText[offset - 1] ?? '';
    const next = fullText[offset + 1] ?? '';
    if (!/[0-9.,]/.test(previous) && !/[0-9.,]/.test(next)) return match;
    return /[Oo]/.test(match) ? '0' : '1';
  });
  value = value.replace(/[^0-9,.'\s]/g, '').replace(/'/g, '').replace(/\s+/g, '');
  if (!/[0-9]/.test(value)) return null;
  const lastDot = Math.max(value.lastIndexOf('.'), value.lastIndexOf(','));
  let major: string;
  let fraction = '';
  if (lastDot >= 0 && value.length - lastDot - 1 > 0 && value.length - lastDot - 1 <= 2) {
    major = value.slice(0, lastDot).replace(/[.,]/g, '');
    fraction = value.slice(lastDot + 1).replace(/[.,]/g, '');
  } else {
    major = value.replace(/[.,]/g, '');
  }
  if (!major) major = '0';
  const cents = Number(major) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return { value: negative ? -cents : cents, corrected: value !== original.replace(/\s+/g, ''), currency: currencyPattern.test(original) ? (original.match(currencyPattern)?.[0] ?? null) : null };
}

export function parseQuantity(input: string): number | null {
  const cleaned = input.trim().replace(',', '.');
  if (!/^\d+(?:\.0+)?$/.test(cleaned)) return null;
  const result = Number(cleaned);
  return result > 0 && result <= 1000 ? result : null;
}
