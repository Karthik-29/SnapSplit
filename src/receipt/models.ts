export type BillItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type OCRToken = {
  text: string;
  confidence?: number;
  boundingBox?: [number, number, number, number];
};

export interface ReceiptOCR {
  extract(file: File): Promise<OCRResult>;
}

export type OCRResult = {
  tokens: OCRToken[];
  text: string;
};

export type Receipt = {
  items: BillItem[];
  rawText?: string;
  total?: number;
};
