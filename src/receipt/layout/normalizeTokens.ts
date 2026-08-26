import { BoundingBox, OCRBoundingBox, OCRToken } from '../models';

export function toBoundingBox(box?: OCRBoundingBox): BoundingBox {
  if (!box) return { x: 0, y: 0, width: 0, height: 0 };
  if (Array.isArray(box)) {
    return { x: box[0], y: box[1], width: Math.max(0, box[2] - box[0]), height: Math.max(0, box[3] - box[1]) };
  }
  return box;
}

export function normalizeToken(token: OCRToken): OCRToken {
  return {
    ...token,
    // Keep the original character data useful for source references, but make
    // ordinary OCR spacing and Unicode variants deterministic for matching.
    text: token.text.normalize('NFKC').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim(),
  };
}

export function normalizedTokens(tokens: OCRToken[]): OCRToken[] {
  return tokens.map(normalizeToken).filter((token) => token.text.length > 0);
}
