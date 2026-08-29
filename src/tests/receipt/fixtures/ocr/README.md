# Captured OCR fixtures

Recorded `OCRResult` payloads — full text plus every token's bounding box and
confidence — produced by running the real photos in [`src/data/`](../../../../data)
through the actual image + OCR pipeline.

These exist so the parser can be tested against what Tesseract genuinely emits
rather than against hand-transcribed text. Hand-typed OCR is always cleaner than
the real thing, and tuning a parser against it optimises for input the app never
sees.

## Regenerating

```sh
CAPTURE_OCR=1 npm run test:capture
```

Runs entirely offline against the `eng.traineddata` committed at the repo root.

**Regenerate deliberately, and review the diff.** These files are the fixed point
the parser is measured against. Re-capturing on every run would let a parser
regression hide behind freshly recorded input — the numbers would still look
fine because both sides moved together.

Regenerate when, and only when, the image stage or OCR settings change
(`src/receipt/image/settings.ts`, preprocessing, region detection). After
regenerating, re-run the accuracy suites and update the floors in
[`../../support/thresholds.ts`](../../support/thresholds.ts) if the numbers moved:

```sh
npm run test:receipts
```
