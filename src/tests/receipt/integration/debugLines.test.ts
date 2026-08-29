import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { detectLines } from '../../../receipt/layout/lineDetection';
import { detectAmountColumn, detectNumericColumnsDetailed } from '../../../receipt/layout/columnDetection';
import { classifyLine } from '../../../receipt/parsing/sectionClassifier';
import { parseMoney } from '../../../receipt/parsing/numberParser';
import { toBoundingBox } from '../../../receipt/layout/normalizeTokens';

const SUMMARY_SECTIONS = ['subtotal', 'tax', 'service_charge', 'discount', 'adjustment', 'total', 'payment'];

function amountsOf(line: { tokens: Array<{ text: string }> }) {
  return line.tokens.filter((token) => /\d/.test(token.text) && parseMoney(token.text) !== null);
}

const here = dirname(fileURLToPath(import.meta.url));
const ocrDir = resolve(here, '../fixtures/ocr');

const enabled = process.env.DEBUG_LINES === '1';

/** Exploratory only: dumps reconstructed lines and their classifications. */
describe.skipIf(!enabled)('debug line reconstruction', () => {
  it('dumps lines', () => {
    const target = process.env.DEBUG_LINES_FILE ?? 'example_bill.webp';
    const captured = JSON.parse(readFileSync(resolve(ocrDir, `${target}.ocr.json`), 'utf8'));
    const lines = detectLines(captured.tokens);
    const columns = detectNumericColumnsDetailed(lines);
    const amountColumn = detectAmountColumn(lines);
    const report = [
      `${target}: ${captured.tokens.length} tokens -> ${lines.length} lines, width=${captured.imageWidth}`,
      `columns: ${JSON.stringify(columns)} amountColumn=${amountColumn}`,
      `lastAmountEdges: ${JSON.stringify(lines.map((line) => {
        const amounts = line.tokens.filter((token) => /\d/.test(token.text) && parseMoney(token.text) !== null);
        if (!amounts.length) return null;
        const box = toBoundingBox(amounts[amounts.length - 1].boundingBox);
        return Math.round(box.x + box.width);
      }).filter((edge) => edge !== null))}`,
    ];
    let seenSummary = false;
    for (const line of lines) {
      const classification = classifyLine(line, seenSummary);
      if (classification.itemHeader) {
        seenSummary = false;
      } else if (SUMMARY_SECTIONS.includes(classification.section) && amountsOf(line).length > 0) {
        seenSummary = true;
      }
      const box = line.boundingBox;
      report.push(`[${classification.section.padEnd(14)} hdr=${classification.itemHeader ? 'Y' : 'n'} y=${String(Math.round(box.y)).padStart(5)} x=${String(Math.round(box.x)).padStart(5)} w=${String(Math.round(box.width)).padStart(5)}] ${line.text}`);
    }
    writeFileSync(resolve(here, '../../../../debug-lines.txt'), `${report.join('\n')}\n`);
  });
});
