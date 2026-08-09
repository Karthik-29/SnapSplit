import { BillItem } from '../receipt/models';
import { BillCalculationResult } from '../bill/models';

export type SheetExportResult = {
  sheetUrl: string;
};

export async function mockExportToGoogleSheet(
  items: BillItem[],
  calculation: BillCalculationResult
): Promise<SheetExportResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1MOCKSHEETID',
      });
    }, 350);
  });
}
