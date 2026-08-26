import { OCRToken } from './models';

type TesseractWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

/**
 * Shared mapping from Tesseract words to OCR tokens.
 *
 * Both the browser worker and the Node capture harness go through this, so a
 * fixture recorded in Node has exactly the token shape the app sees.
 */
export function tesseractWordsToTokens(words: TesseractWord[] | undefined): OCRToken[] {
  return (words ?? []).map((word) => ({
    text: word.text,
    confidence: word.confidence,
    boundingBox: {
      x: word.bbox.x0,
      y: word.bbox.y0,
      width: word.bbox.x1 - word.bbox.x0,
      height: word.bbox.y1 - word.bbox.y0,
    },
  }));
}
