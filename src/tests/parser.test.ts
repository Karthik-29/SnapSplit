import { describe, expect, it } from 'vitest';
import { parseReceiptData, parseReceiptLines } from '../receipt/parser';
import { OCRResult } from '../receipt/models';
import sampleBillOCR from './sample_bill_ocr.json';

type SimplifiedItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

const example_bill = `© VICTORY VENTURES
KAMAT HOSARUCHI
Mysore Bangalore Road
Mudagere, Channapatna (T)
Ramanagara (D)
S - AGsPRMamD o
bate : c6s0z/24  Binl o, = 41871
T.No.: 7 W. No. | 7
;’-z-a;:dculars Qty Rate Amount
KAJU MASALA [I=250 250
GOBI MANCHURIAN 1 140 140
ROTI 4 40 160
KULCHA 2 50 100
Food Total : 650. 00

Prices incl. of taxes as summarized
Rs 650 includes CGST @2.5% Rs 16.48

Rs 650 includes SGST @2.5% Rs 15.48
4/8/2 Total : 650
GSTIN. 29ABLPH1358N323 (08:17
E. 80.E. Thank You Visit Again`;

const sample_bill = `T oo ) alamy
.
ElChalanrestaurant@gzail.com .
TABLE: 13 - 1 Guest "
Your Server was Rossy 4
3/12/2016 1:13:51 PM /
v Sequence #: 0000068 /
L 1D #: 0389450 al
N ITEM QTY PRICE
4 CAUSA DE POLLO i -””7”1"7$8.95
CEVICHE DE CAMARONES 1 $16.95 a
LIMONADA 1 $4.00
PESCADO AL AJILLO 1 $15.95
Subtotal $45.85
Total Taxes $3.617
Grand Total $49.52
nount De: W
15% 20% 25% \\
$7.43 $9.90 $12.38 R
T1P 1S NOT IKCLUDED  PROPINA NO INCLUIDA
THANK YOU - GRACIAS!!! 4
Guest Check i
((}‘ - e ==mz=zzoESSESSSSESSESSSSSES
c ? % V
P N
I a el N
alamy e`;

describe('parseReceiptData', () => {
  it('extracts items and summary totals from example bill text', () => {
    const input: OCRResult = {
      text: example_bill,
      tokens: [],
    };

    const result = parseReceiptData(input);
    expect(result.subtotal).toBe(650);
    expect(result.total).toBe(650);
    expect(result.items).toEqual([
      { id: expect.any(String), name: 'KAJU MASALA', quantity: 1, unitPrice: 250, totalPrice: 250 },
      { id: expect.any(String), name: 'GOBI MANCHURIAN', quantity: 1, unitPrice: 140, totalPrice: 140 },
      { id: expect.any(String), name: 'ROTI', quantity: 4, unitPrice: 40, totalPrice: 160 },
      { id: expect.any(String), name: 'KULCHA', quantity: 2, unitPrice: 50, totalPrice: 100 },
    ]);
  });

  it('parses a real OCR sample bill and preserves subtotal/total', () => {
    const input: OCRResult = {
      text: sample_bill,
      tokens: [],
    };

    const result = parseReceiptData(input);

    expect(result.subtotal).toBe(45.85);
    expect(result.total).toBe(49.52);
    expect(result.items).toEqual([
      { id: expect.any(String), name: 'CAUSA DE POLLO', quantity: 1, unitPrice: 8.95, totalPrice: 8.95 },
      { id: expect.any(String), name: 'CEVICHE DE CAMARONES', quantity: 1, unitPrice: 16.95, totalPrice: 16.95 },
      { id: expect.any(String), name: 'LIMONADA', quantity: 1, unitPrice: 4, totalPrice: 4 },
      { id: expect.any(String), name: 'PESCADO AL AJILLO', quantity: 1, unitPrice: 15.95, totalPrice: 15.95 },
    ]);
  });

  it('parses the actual sample_bill.jpg OCR result into bill items', () => {
    const input: OCRResult = sampleBillOCR as OCRResult;
    const result = parseReceiptData(input);

    expect(result.subtotal).toBe(45.85);
    expect(result.total).toBe(49.52);
    expect(result.items).toEqual([
      { id: expect.any(String), name: 'CAUSA DE POLLO', quantity: 1, unitPrice: 8.95, totalPrice: 8.95 },
      { id: expect.any(String), name: 'CEVICHE DE CAMARONES', quantity: 1, unitPrice: 16.95, totalPrice: 16.95 },
      { id: expect.any(String), name: 'LIMONADA', quantity: 1, unitPrice: 4, totalPrice: 4 },
      { id: expect.any(String), name: 'PESCADO AL AJILLO', quantity: 1, unitPrice: 15.95, totalPrice: 15.95 },
    ]);
  });
});

describe('parseReceiptLines', () => {
  it('parses receipt lines from a real OCR sample bill and ignores summary labels', () => {
    const input: OCRResult = {
      text: example_bill,
      tokens: [],
    };

    const items = parseReceiptLines(input);

    expect(items).toEqual([
      { id: expect.any(String), name: 'KAJU MASALA', quantity: 1, unitPrice: 250, totalPrice: 250 },
      { id: expect.any(String), name: 'GOBI MANCHURIAN', quantity: 1, unitPrice: 140, totalPrice: 140 },
      { id: expect.any(String), name: 'ROTI', quantity: 4, unitPrice: 40, totalPrice: 160 },
      { id: expect.any(String), name: 'KULCHA', quantity: 2, unitPrice: 50, totalPrice: 100 },
    ]);
  });
});
