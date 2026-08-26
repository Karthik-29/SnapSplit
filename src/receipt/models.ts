/** Monetary values in the inference pipeline are integer minor units. */
export type Money = number;

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Raw RGBA pixels, structurally compatible with the DOM's ImageData.
 *
 * The image stage is typed against this rather than ImageData so the exact same
 * code runs in the browser and under Node in tests. A browser ImageData is
 * assignable here with no adapter; Node supplies a plain object.
 */
export type RgbaImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/** A legacy tuple is accepted at the OCR boundary while older fixtures migrate. */
export type OCRBoundingBox = BoundingBox | [number, number, number, number];

export type OCRToken = {
  text: string;
  confidence?: number;
  boundingBox?: OCRBoundingBox;
};

export type OCRResult = {
  imageWidth?: number;
  imageHeight?: number;
  tokens: OCRToken[];
  text: string;
  detectedReceiptRegion?: BoundingBox;
  preprocessing?: ImagePreprocessingDiagnostics;
};

export interface ReceiptOCR {
  extract(image: Blob | RgbaImage): Promise<OCRResult>;
}

export type ImagePreprocessingOptions = {
  maxDimension?: number;
  /** Upscales small crops so OCR gets enough pixels per glyph. */
  minDimension?: number;
  grayscale?: boolean;
  contrast?: number;
  sharpen?: boolean;
};

export type ImagePreprocessingDiagnostics = {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  cropped: boolean;
  regionConfidence?: number;
};

export type ReceiptRegionCandidate = {
  boundingBox: BoundingBox;
  confidence: number;
  reason: 'document_boundary' | 'text_density' | 'content_region' | 'full_image';
};

export type ReceiptSection =
  | 'header' | 'item' | 'subtotal' | 'tax' | 'service_charge' | 'discount'
  | 'adjustment' | 'total' | 'payment' | 'footer' | 'unknown';

export type OCRLine = {
  tokens: OCRToken[];
  text: string;
  boundingBox: BoundingBox;
};

export type ParsedField<T> = {
  value: T | null;
  confidence: number;
  sourceTokens: OCRToken[];
  source?: 'ocr' | 'derived';
};

export type ParsedBillItem = {
  id: string;
  name: ParsedField<string>;
  quantity: ParsedField<number>;
  unitPrice: ParsedField<Money>;
  totalPrice: ParsedField<Money>;
};

export type MonetaryValue = {
  value: Money;
  source: 'ocr' | 'derived';
  confidence: number;
  sourceTokens?: OCRToken[];
};

export type TaxComponent = { label: string; amount: Money; confidence: number; sourceTokens: OCRToken[] };
export type ChargeComponent = { label: string; amount: Money; confidence: number; sourceTokens: OCRToken[] };
export type Adjustment = { label: string; amount: Money; confidence: number; sourceTokens: OCRToken[] };
export type TotalCandidate = { label: string; amount: Money; confidence: number; sourceTokens: OCRToken[] };

export type ReconciliationResult = {
  expectedTotal: Money | null;
  extractedTotal: Money | null;
  difference: Money | null;
  status: 'match' | 'mismatch' | 'insufficient_data';
};

export type ParseDiagnostics = {
  detectedReceiptRegion?: BoundingBox;
  lines: Array<{ text: string; classification: ReceiptSection; confidence: number }>;
  ignoredLines: string[];
  warnings: string[];
  candidateTotals: TotalCandidate[];
  numericColumns?: number[];
};

export type ParsedBill = {
  currency: string | null;
  items: ParsedBillItem[];
  subtotal: MonetaryValue | null;
  taxComponents: TaxComponent[];
  chargeComponents: ChargeComponent[];
  adjustments: Adjustment[];
  total: MonetaryValue | null;
  reconciliation: ReconciliationResult;
  diagnostics: ParseDiagnostics;
};

/** App-facing bill values stay in major units until the broader app migrates. */
export type BillItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type Receipt = {
  items: BillItem[];
  rawText?: string;
  subtotal?: number;
  total?: number;
};
