import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { realReceiptFixtures } from '../fixtures/realReceiptFixtures';
import { aggregateScore, formatOcrScoreTable, scoreOcrText, OcrTextScore } from '../support/score';
import { OCR_QUALITY_AGGREGATE_FLOOR, OCR_QUALITY_FLOOR } from '../support/thresholds';

const here = dirname(fileURLToPath(import.meta.url));
const ocrDir = resolve(here, '../fixtures/ocr');

/**
 * Scores the committed OCR fixtures on whether the bill's own names and amounts
 * survived into the text. This is the image stage's report card; it runs fast
 * and needs no OCR because the fixtures are recorded.
 */
describe('OCR text quality', () => {
  const scores: OcrTextScore[] = realReceiptFixtures.map((fixture) => {
    const captured = JSON.parse(readFileSync(resolve(ocrDir, `${fixture.sourceFile}.ocr.json`), 'utf8'));
    return scoreOcrText(fixture, captured.text);
  });

  it('reports the per-receipt score table', () => {
    const table = formatOcrScoreTable(scores);
    writeFileSync(resolve(here, '../../../../ocr-quality-report.txt'), `${table}\n`);
    expect(scores).toHaveLength(realReceiptFixtures.length);
  });

  it.each(scores.map((score) => [score.sourceFile, score] as const))(
    'meets the recorded floor for %s',
    (_sourceFile, score) => {
      expect(score.score).toBeGreaterThanOrEqual(OCR_QUALITY_FLOOR[score.sourceFile] ?? 0);
    },
  );

  it('meets the aggregate floor', () => {
    expect(aggregateScore(scores)).toBeGreaterThanOrEqual(OCR_QUALITY_AGGREGATE_FLOOR);
  });
});
