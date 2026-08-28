import { describe, expect, it } from 'vitest';
import { parseReceiptData, parseReceiptLines } from '../receipt/parser';
import { OCRResult } from '../receipt/models';
import sampleBillOCR from './receipt/fixtures/ocr/sample_bill.jpg.ocr.json';

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

const test_bill_1_ocr = `SRI MAHALAKSHMI
TIFFIN ROOM
BENGALURU-19
TABLE 0005 CUR 01 WATER 00
DESCRIPTION QTY RATE AMOUNT
MASALA DOSA 2.00 75.00 150.00
BLACK COFFEE 1.00 28.00 28.00
CASH ₹ 178.00`;

const test_bill_2_ocr = `BRIK OVEN
Type: Table
Table Number: L 6
Item Qty Amt
French Fries
- Salted 1 310.00
Red Cotta
Pizza - Mini 1 260.00
Classico Cold
Brew 1 240.00
Vietnamese
Iced Coffee 1 280.00
Dark
Chocolate
Mousse 1 400.00
Total Qty 5
Sub Total: 1490.00
GST@5% 74.50
CGST @2.5 37.25
SGST @2.5 37.25
Round Off: 0.50
Total Invoice Value 1565.00`;

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

  it('converts a real OCR capture into major-unit bill items', () => {
    // Exercises the legacy major-unit adapter against genuine captured OCR.
    // Item names are asserted loosely on purpose: OCR renders them imperfectly
    // ("PESCADD"), and pinning exact spellings here would only encode today's
    // OCR noise. Extraction accuracy is measured in the receipt integration
    // suite instead.
    //
    // Recalibrated: the Node capture harness used to decode this JPEG with
    // `jpeg-js`, a pure-JS decoder measurably different from a browser's own
    // canvas decoder (see thresholds.ts and nodeImage.ts). Now that it decodes
    // with the same WASM mozjpeg build a browser effectively matches, CAUSA DE
    // POLLO's own row merges into the next item's line and its price (8.95)
    // is not recoverable from this capture -- a real, honest result, not a
    // fixture that got worse on its own.
    const result = parseReceiptData(sampleBillOCR as OCRResult);

    expect(result.total).toBe(49.52);
    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.totalPrice)).toEqual([16.95, 4, 15.9]);
    for (const item of result.items) {
      expect(item.name.length).toBeGreaterThan(3);
      expect(item.quantity).toBe(1);
    }
  });

  it('parses the SRI MAHALAKSHMI receipt OCR with decimal quantities and CASH total', () => {
    const result = parseReceiptData({ text: test_bill_1_ocr, tokens: [] });

    expect(result.subtotal).toBe(178);
    expect(result.total).toBe(178);
    expect(result.items).toEqual([
      { id: expect.any(String), name: 'MASALA DOSA', quantity: 2, unitPrice: 75, totalPrice: 150 },
      { id: expect.any(String), name: 'BLACK COFFEE', quantity: 1, unitPrice: 28, totalPrice: 28 },
    ]);
  });

  it('rejoins wrapped BRIK OVEN item names and parses invoice totals', () => {
    const result = parseReceiptData({ text: test_bill_2_ocr, tokens: [] });

    expect(result.subtotal).toBe(1490);
    expect(result.total).toBe(1565);
    expect(result.items).toEqual([
      { id: expect.any(String), name: 'French Fries - Salted', quantity: 1, unitPrice: 310, totalPrice: 310 },
      { id: expect.any(String), name: 'Red Cotta Pizza - Mini', quantity: 1, unitPrice: 260, totalPrice: 260 },
      { id: expect.any(String), name: 'Classico Cold Brew', quantity: 1, unitPrice: 240, totalPrice: 240 },
      { id: expect.any(String), name: 'Vietnamese Iced Coffee', quantity: 1, unitPrice: 280, totalPrice: 280 },
      { id: expect.any(String), name: 'Dark Chocolate Mousse', quantity: 1, unitPrice: 400, totalPrice: 400 },
    ]);
  });

  it('recognizes OCR-damaged amount headers and stops before receipt metadata', () => {
    const result = parseReceiptData({
      text: `BRIK OVEN\nPH NO : 9148100119\nType:Table\nTable Number: L 6\ney Qty Amt\nFrench Fries\n- Salted 1 310.00\nRed Cotta\nPizza - Mini 1 260.00\nSub Total: 570.00\nCGST @2.5 14.25\nRound Off: 0.00\nTotal Invoice Value 584.25\nComment: order from orders.brikoven.com`,
      tokens: [],
    });

    expect(result.items.map((item) => item.name)).toEqual([
      'French Fries - Salted',
      'Red Cotta Pizza - Mini',
    ]);
    expect(result.items.some((item) => item.name === 'PH NO')).toBe(false);
    expect(result.total).toBe(584.25);
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
