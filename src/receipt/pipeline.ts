import { ImagePreprocessingOptions, ParsedBill, ReceiptOCR, RgbaImage } from './models';
import { ImageDecoder } from './image/decode';
import { normalizeReceiptImage } from './image/normalize';
import { parseReceipt } from './parsing/receiptParser';

export type ReceiptPipelineOptions = {
  preprocessing?: ImagePreprocessingOptions;
  /** Overridden by the Node test harness; the browser uses the canvas decoder. */
  decode?: ImageDecoder;
};

export async function inferReceiptBill(
  image: Blob | RgbaImage,
  ocr: ReceiptOCR,
  options: ReceiptPipelineOptions = {},
): Promise<ParsedBill> {
  const normalized = await normalizeReceiptImage(image, options.preprocessing, options.decode);
  const ocrResult = await ocr.extract(normalized.imageData);
  const parsed = parseReceipt({
    ...ocrResult,
    imageWidth: normalized.imageData.width,
    imageHeight: normalized.imageData.height,
  });
  if (normalized.region) parsed.diagnostics.detectedReceiptRegion = normalized.region.boundingBox;
  return parsed;
}
