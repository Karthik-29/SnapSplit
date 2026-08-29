export type ExpectedReceiptFixture = {
  sourceFile: string;
  ocrText: string;
  expected: {
    items: Array<{ name: string; quantity: number | null; unitPrice: number | null; totalPrice: number }>;
    subtotal: number;
    total: number;
    taxComponents?: Array<{ labelIncludes: string; amount: number }>;
    adjustments?: Array<{ labelIncludes: string; amount: number }>;
    reconciliationStatus: 'match' | 'mismatch' | 'insufficient_data';
  };
};

export const realReceiptFixtures: ExpectedReceiptFixture[] = [
  {
    sourceFile: 'example_bill.webp',
    ocrText: `VICTORY VENTURES
KAMAT HOSARUCHI
Particulars Qty Rate Amount
KAJU MASALA 1 250 250
GOBI MANCHURIAN 1 140 140
ROTI 4 40 160
KULCHA 2 50 100
Food Total : 650.00
Prices incl. of taxes as summarized
Rs 650 includes CGST @2.5% Rs 15.48
Rs 650 includes SGST @2.5% Rs 15.48
Total : 650`,
    expected: {
      items: [
        { name: 'KAJU MASALA', quantity: 1, unitPrice: 25000, totalPrice: 25000 },
        { name: 'GOBI MANCHURIAN', quantity: 1, unitPrice: 14000, totalPrice: 14000 },
        { name: 'ROTI', quantity: 4, unitPrice: 4000, totalPrice: 16000 },
        { name: 'KULCHA', quantity: 2, unitPrice: 5000, totalPrice: 10000 },
      ],
      subtotal: 65000,
      total: 65000,
      taxComponents: [
        { labelIncludes: 'CGST', amount: 1548 },
        { labelIncludes: 'SGST', amount: 1548 },
      ],
      reconciliationStatus: 'mismatch',
    },
  },
  {
    sourceFile: 'sample_bill.jpg',
    ocrText: `El Chalan
TABLE: 13 - 1 Guest
N ITEM QTY PRICE
CAUSA DE POLLO 1 $8.95
CEVICHE DE CAMARONES 1 $16.95
LIMONADA 1 $4.00
PESCADO AL AJILLO 1 $15.95
Subtotal $45.85
Total Taxes $3.67
Grand Total $49.52
THANK YOU - GRACIAS`,
    expected: {
      items: [
        { name: 'CAUSA DE POLLO', quantity: 1, unitPrice: 895, totalPrice: 895 },
        { name: 'CEVICHE DE CAMARONES', quantity: 1, unitPrice: 1695, totalPrice: 1695 },
        { name: 'LIMONADA', quantity: 1, unitPrice: 400, totalPrice: 400 },
        { name: 'PESCADO AL AJILLO', quantity: 1, unitPrice: 1595, totalPrice: 1595 },
      ],
      subtotal: 4585,
      total: 4952,
      taxComponents: [{ labelIncludes: 'Taxes', amount: 367 }],
      reconciliationStatus: 'match',
    },
  },
  {
    sourceFile: 'test_bill-1.jpeg',
    ocrText: `SRI MAHALAKSHMI
TIFFIN ROOM
DESCRIPTION QTY RATE AMOUNT
MASALA DOSA 2.00 75.00 150.00
BLACK COFFEE 1.00 28.00 28.00
CASH Rs 178.00`,
    expected: {
      items: [
        { name: 'MASALA DOSA', quantity: 2, unitPrice: 7500, totalPrice: 15000 },
        { name: 'BLACK COFFEE', quantity: 1, unitPrice: 2800, totalPrice: 2800 },
      ],
      subtotal: 17800,
      total: 17800,
      reconciliationStatus: 'match',
    },
  },
  {
    sourceFile: 'test_bill-2.jpeg',
    ocrText: `BRIK OVEN
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
Total Invoice Value 1565.00`,
    expected: {
      items: [
        { name: 'French Fries - Salted', quantity: 1, unitPrice: 31000, totalPrice: 31000 },
        { name: 'Red Cotta Pizza - Mini', quantity: 1, unitPrice: 26000, totalPrice: 26000 },
        { name: 'Classico Cold Brew', quantity: 1, unitPrice: 24000, totalPrice: 24000 },
        { name: 'Vietnamese Iced Coffee', quantity: 1, unitPrice: 28000, totalPrice: 28000 },
        { name: 'Dark Chocolate Mousse', quantity: 1, unitPrice: 40000, totalPrice: 40000 },
      ],
      subtotal: 149000,
      total: 156500,
      taxComponents: [
        { labelIncludes: 'GST', amount: 7450 },
        { labelIncludes: 'CGST', amount: 3725 },
        { labelIncludes: 'SGST', amount: 3725 },
      ],
      adjustments: [{ labelIncludes: 'Round Off', amount: 50 }],
      reconciliationStatus: 'match',
    },
  },
];
