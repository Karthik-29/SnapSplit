# SnapSplit — Edge OCR and Deterministic Receipt Parsing Pipeline Specification

## 1. Scope

This specification covers only the receipt image processing, OCR, layout analysis, and deterministic receipt data parsing pipeline.

The pipeline converts a receipt image into structured bill data for the existing SnapSplit validation and bill-splitting flow.

All processing must run locally in the browser.

The pipeline must not use:

* LLMs
* Generative AI
* Vision-language models
* Cloud OCR
* Server-side image processing
* Backend inference

The overall flow is:

```text
Receipt Image
      ↓
Image Preprocessing
      ↓
Receipt / Relevant Content Region Detection
      ↓
Crop / Perspective Correction / Normalization
      ↓
OCR
      ↓
OCR Tokens + Bounding Boxes
      ↓
Layout Reconstruction
      ↓
Receipt Section Classification
      ↓
Item and Summary Parsing
      ↓
Mathematical Reconciliation
      ↓
ParsedBill
      ↓
Existing Validation and User Correction
      ↓
ValidatedBill
```

The pipeline must remain independent from:

* React UI
* Google APIs
* Google Sheets
* Collaboration logic
* Claims logic
* Bill splitting logic

Its responsibility ends at producing a structured `ParsedBill` and diagnostics.

---

# 2. Objectives

The pipeline must solve the following problems.

## 2.1 Detect the relevant receipt content

A captured image may contain irrelevant visual information such as:

* background surfaces
* shadows
* hands or fingers
* large blank margins
* surrounding objects
* multiple pieces of paper
* other text outside the receipt

The pipeline should attempt to identify the receipt or the dominant relevant text/document region before running the main OCR pipeline.

Failure to detect a clean receipt boundary must not cause the pipeline to fail.

---

## 2.2 Preserve OCR geometry

The parser must not operate only on a concatenated OCR text string.

OCR output must preserve bounding boxes and confidence where available.

```ts
type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OCRToken = {
  text: string;
  confidence?: number;
  boundingBox: BoundingBox;
};

type OCRResult = {
  imageWidth: number;
  imageHeight: number;
  tokens: OCRToken[];
};
```

Spatial information must be used for:

* reconstructing logical lines
* determining reading order
* identifying numeric columns
* associating quantities and prices with item names
* separating item rows from summary rows
* identifying the likely receipt structure

---

## 2.3 Separate useful bill data from irrelevant information

The pipeline must classify receipt content into logical categories.

```ts
type ReceiptSection =
  | "header"
  | "item"
  | "subtotal"
  | "tax"
  | "service_charge"
  | "discount"
  | "adjustment"
  | "total"
  | "payment"
  | "footer"
  | "unknown";
```

The parser must identify information relevant to bill splitting and prevent unrelated receipt content from being interpreted as purchased items or monetary totals.

Potentially irrelevant information may include:

* branding
* addresses
* contact details
* tax registration identifiers
* invoice or order identifiers
* dates and times
* table or terminal identifiers
* payment metadata
* transaction references
* cashier information
* promotional text
* footer messages

Ignored information should remain available through diagnostics during development but should not appear in the parsed bill model.

---

## 2.4 Extract all monetary information needed for splitting

The parser must attempt to extract:

* purchased items
* item quantities
* unit prices where available or derivable
* item totals
* subtotal
* tax components
* aggregate tax
* service charges or other charges
* discounts
* adjustments
* final payable total

This information is required because downstream splitting allocates taxes and charges proportionally according to participant item subtotals.

The pipeline must therefore parse the summary section of the receipt in addition to individual item rows.

---

# 3. Architecture

Suggested project structure:

```text
src/
└── receipt/
    ├── models.ts
    │
    ├── image/
    │   ├── preprocess.ts
    │   ├── receiptDetector.ts
    │   ├── crop.ts
    │   ├── perspective.ts
    │   └── normalize.ts
    │
    ├── ocr/
    │   ├── ReceiptOCR.ts
    │   └── PaddleOCR.ts
    │
    ├── layout/
    │   ├── normalizeTokens.ts
    │   ├── lineDetection.ts
    │   ├── columnDetection.ts
    │   └── readingOrder.ts
    │
    ├── parsing/
    │   ├── keywordMatcher.ts
    │   ├── numberParser.ts
    │   ├── sectionClassifier.ts
    │   ├── itemParser.ts
    │   ├── totalsParser.ts
    │   └── receiptParser.ts
    │
    ├── validation/
    │   └── validation.ts
    │
    └── debug/
        └── diagnostics.ts
```

Each stage must expose a clear input/output contract and be independently testable.

---

# 4. Stage 1 — Image Preprocessing

## Objective

Prepare the receipt image for region detection and OCR without unnecessarily degrading text quality.

Possible preprocessing operations include:

* resizing
* orientation correction
* grayscale conversion
* contrast normalization
* optional sharpening
* noise reduction where appropriate

Preprocessing should be configurable.

```ts
type ImagePreprocessingOptions = {
  maxDimension?: number;
  grayscale?: boolean;
  contrast?: number;
  sharpen?: boolean;
};
```

The original image must remain unchanged.

The pipeline should produce derived image representations rather than mutating the original source.

Preprocessing should not assume that aggressive enhancement always improves OCR accuracy.

---

# 5. Stage 2 — Receipt or Relevant Content Region Detection

## Objective

Identify the region containing the receipt or the dominant relevant text content.

The implementation should use deterministic computer vision techniques before the main OCR pass.

Suggested high-level pipeline:

```text
Input Image
    ↓
Normalization
    ↓
Edge / Boundary Analysis
    ↓
Contour Detection
    ↓
Candidate Document Regions
    ↓
Candidate Scoring
    ↓
Best Receipt Candidate
```

Candidate scoring may consider:

* size relative to the image
* rectangularity
* plausible document geometry
* edge continuity
* text density
* dominant position
* likelihood of containing structured text

The implementation must not assume a single fixed receipt aspect ratio.

---

## 5.1 Perspective correction

If a plausible quadrilateral receipt boundary is detected, the pipeline should support perspective correction before OCR.

```text
Detected receipt corners
        ↓
Perspective transform
        ↓
Normalized receipt image
```

Perspective correction should only be applied when the detected geometry is sufficiently reliable.

---

## 5.2 Fallback behavior

Receipt detection must fail gracefully.

Fallback sequence:

```text
High-confidence document boundary
        ↓
Use cropped / perspective-corrected receipt

Otherwise
        ↓
Use dominant text-dense region if available

Otherwise
        ↓
Run OCR on normalized full image
```

The absence of a clean receipt boundary must not prevent OCR or parsing.

---

## 5.3 Text-density refinement

The implementation may use lightweight text detection or OCR geometry to refine the crop.

Possible flow:

```text
Image
  ↓
Initial text detection
  ↓
Cluster text boxes
  ↓
Find dominant text region
  ↓
Expand with safe margins
  ↓
Crop
  ↓
Main OCR
```

This stage must remain deterministic and local.

---

# 6. Stage 3 — OCR

The rest of the application must depend only on an OCR abstraction.

```ts
export interface ReceiptOCR {
  extract(image: ImageData): Promise<OCRResult>;
}
```

Initial implementation:

```text
PaddleOCR.js
      ↓
ONNX Runtime Web
      ↓
WebGPU when available
      ↓
WASM / CPU fallback
```

The OCR implementation must be replaceable without requiring changes to:

* layout reconstruction
* receipt parsing
* validation
* downstream bill logic

---

# 7. Stage 4 — OCR Token Normalization

OCR tokens must be normalized before layout reconstruction and parsing.

Normalization may include:

* whitespace cleanup
* Unicode normalization
* currency formatting normalization
* punctuation normalization
* removal of OCR-introduced spacing where appropriate

Numeric OCR correction must be context-sensitive.

Do not globally transform ambiguous characters because that can corrupt item names and labels.

Instead:

1. Preserve the original token text.
2. Determine whether the token is being interpreted as numeric.
3. Apply limited numeric correction only within numeric parsing.

The parser should retain the source token associated with any parsed value.

---

# 8. Stage 5 — Layout Reconstruction

OCR engines may return individual tokens or small text fragments.

The layout layer must reconstruct logical receipt lines.

Suggested process:

1. Sort tokens by vertical position.
2. Cluster tokens with overlapping or sufficiently close vertical coordinates.
3. Use configurable tolerances based on token size where possible.
4. Sort tokens within each line from left to right.
5. Construct logical lines while retaining token geometry.

```ts
type OCRLine = {
  tokens: OCRToken[];
  text: string;
  boundingBox: BoundingBox;
};
```

The implementation must tolerate:

* minor OCR box misalignment
* different font sizes
* wrapped item descriptions
* uneven spacing
* missing or fragmented tokens

---

# 9. Stage 6 — Reading Order and Column Detection

The parser must reconstruct the spatial structure of the receipt rather than assuming a fixed text layout.

## Reading order

Logical lines should generally be processed from top to bottom.

Within a line, tokens should generally be processed from left to right.

The implementation should retain enough geometry to handle exceptions.

---

## Numeric columns

Do not assume that every receipt follows a fixed numeric structure.

Instead:

1. Identify numeric or likely monetary tokens.
2. Record their X coordinates.
3. Cluster similar horizontal positions.
4. Identify candidate numeric columns.
5. Infer likely column semantics using consistency across multiple rows.

Possible semantic columns include:

* quantity
* unit price
* discount
* item total

Column inference must combine:

* horizontal position
* numeric values
* consistency across rows
* optional header information
* arithmetic relationships

---

# 10. Stage 7 — Receipt Section Classification

Each reconstructed line must be classified before final parsing.

```ts
type ClassifiedLine = {
  line: OCRLine;
  section: ReceiptSection;
  confidence: number;
};
```

Classification should combine multiple deterministic signals.

## Keyword signals

Maintain configurable keyword groups for concepts such as:

* subtotal
* tax
* service charges
* discounts
* adjustments
* total
* payment information

Keyword matching should be:

* case-insensitive
* whitespace tolerant
* punctuation tolerant

Keyword matching must not be the only classification signal.

---

## Spatial and structural signals

The parser should use the general receipt structure as a heuristic:

```text
Header / metadata
      ↓
Item region
      ↓
Summary region
      ↓
Payment / footer
```

This ordering is not guaranteed, so it must not be treated as a hard rule.

Once a high-confidence summary region is detected, subsequent lines should generally receive stronger scrutiny before being classified as item rows.

This helps prevent payment metadata or footer text from becoming bill items.

---

## Numeric structure

Likely item rows and summary rows should be distinguished using their structural properties.

Potential signals include:

* amount of alphabetic content
* number of numeric fields
* numeric column alignment
* presence of known summary labels
* consistency with neighboring lines
* position relative to the detected summary region

---

# 11. Item Region Detection

The parser should identify the contiguous or near-contiguous set of lines most likely to represent purchased items.

The goal is to separate:

```text
Receipt metadata
```

from:

```text
Purchased items
```

and from:

```text
Summary, payment, and footer information
```

The implementation should use neighboring lines to resolve ambiguity.

A line should not become an item merely because it contains both text and a number.

Item detection should consider:

* similarity to nearby candidate item rows
* numeric column alignment
* position before summary sections
* absence of strong summary/payment keywords
* plausibility as a purchasable item description

---

# 12. Item Parsing

The item parser must support multiple receipt layouts.

Potential representations may include:

* item description plus total
* item description plus quantity and total
* item description plus quantity, unit price, and total
* quantity expressed through multiplication notation
* multi-line or wrapped descriptions

The parser should infer fields from the available structure.

```ts
type ParsedField<T> = {
  value: T | null;
  confidence: number;
  sourceTokens: OCRToken[];
};
```

```ts
type ParsedBillItem = {
  id: string;
  name: ParsedField<string>;
  quantity: ParsedField<number>;
  unitPrice: ParsedField<Money>;
  totalPrice: ParsedField<Money>;
};
```

Rules:

* Do not invent a quantity when there is insufficient evidence.
* Do not invent a unit price unless it can be safely derived.
* Derived values must be distinguishable from OCR-extracted values where relevant.
* Preserve uncertainty for downstream validation.

Wrapped item descriptions should be merged when structural evidence indicates that adjacent lines belong to the same item.

---

# 13. Monetary Parsing

All money must be represented internally using integer minor currency units.

```ts
type Money = number;
```

The numeric parser must handle reasonable variations in:

* currency symbols
* decimal separators
* spacing
* thousands separators
* OCR formatting artifacts

Numeric parsing should expose whether correction or normalization was applied.

A parsed monetary value should retain source information.

```ts
type MonetaryValue = {
  value: Money;
  source: "ocr" | "derived";
  confidence: number;
  sourceTokens?: OCRToken[];
};
```

---

# 14. Subtotal Extraction

The parser must search explicitly for a subtotal or equivalent pre-tax/pre-charge amount.

Keyword matching must be configurable rather than hardcoded throughout the parser.

```ts
subtotal: MonetaryValue | null;
```

If no explicit subtotal is available, the parser may derive a subtotal from extracted item totals.

A derived subtotal must remain distinguishable from an OCR-extracted subtotal.

Do not overwrite an extracted subtotal with a calculated value.

---

# 15. Tax Extraction

The parser must identify individual tax components where possible.

```ts
type TaxComponent = {
  label: string;
  amount: Money;
  confidence: number;
  sourceTokens: OCRToken[];
};
```

The aggregate tax is:

```text
totalTax = sum(taxComponents)
```

The detailed components should be preserved even if the downstream splitting engine initially consumes only the aggregate.

Tax extraction should support multiple tax lines.

---

# 16. Service Charges and Other Charges

Charges should be represented separately from tax.

```ts
type ChargeComponent = {
  label: string;
  amount: Money;
  confidence: number;
  sourceTokens: OCRToken[];
};
```

The parser should preserve individual charge components rather than immediately collapsing all charges into a single number.

The aggregate service or additional charge may be exposed for the existing bill model.

---

# 17. Discounts and Adjustments

Discounts and adjustments must be parsed separately from taxes and charges.

```ts
type Adjustment = {
  label: string;
  amount: Money;
  confidence: number;
  sourceTokens: OCRToken[];
};
```

Adjustments may be positive or negative.

The parser must preserve the signed amount and original label.

Do not silently convert all adjustments into discounts.

---

# 18. Final Total Detection

The parser must identify the final payable amount.

Multiple candidate totals may exist.

Candidate ranking should consider:

1. keyword strength
2. position within the summary section
3. position relative to other summary values
4. whether the candidate reconciles mathematically with extracted values
5. confidence of the underlying OCR tokens

The parser must preserve candidate totals in diagnostics when ambiguity exists.

```ts
type TotalCandidate = {
  label: string;
  amount: Money;
  confidence: number;
  sourceTokens: OCRToken[];
};
```

The selected total should not be silently forced to match a derived calculation.

---

# 19. Mathematical Reconciliation

After extraction, run deterministic reconciliation.

The reconciliation layer must compare available monetary values.

Conceptually:

```text
Subtotal
+ Taxes
+ Charges
+ Positive adjustments
- Discounts
≈ Final total
```

The exact reconciliation formula must be derived from the extracted components and their signs.

Do not alter extracted values to make the equation match.

Instead, report the result.

```ts
type ReconciliationResult = {
  expectedTotal: Money | null;
  extractedTotal: Money | null;
  difference: Money | null;
  status: "match" | "mismatch" | "insufficient_data";
};
```

The parser may also compare:

```text
sum(item totals)
```

against:

```text
extracted subtotal
```

These comparisons must be diagnostic and must not overwrite source values.

---

# 20. Parsed Output Contract

The OCR pipeline must produce an intermediate parsed representation.

It must not directly produce the application's confirmed bill model.

```ts
type ParsedBill = {
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
```

Pipeline boundary:

```text
Receipt Image
      ↓
OCR and Parsing Pipeline
      ↓
ParsedBill
      ↓
Existing Validation / User Correction
      ↓
ValidatedBill
```

The validation layer remains responsible for allowing the user to correct uncertain or incorrect extraction results.

---

# 21. Diagnostics and Debugging

Receipt parsing is heuristic and requires visibility into intermediate stages.

Provide diagnostics suitable for development and testing.

```ts
type ParseDiagnostics = {
  detectedReceiptRegion?: BoundingBox;

  lines: Array<{
    text: string;
    classification: ReceiptSection;
    confidence: number;
  }>;

  ignoredLines: string[];

  warnings: string[];

  candidateTotals: TotalCandidate[];
};
```

Development tooling should make it possible to inspect:

```text
Original image
      ↓
Detected receipt/content region
      ↓
Processed OCR input
      ↓
OCR bounding boxes
      ↓
Reconstructed lines
      ↓
Detected numeric columns
      ↓
Line classifications
      ↓
Detected item region
      ↓
Parsed monetary fields
      ↓
Reconciliation results
```

Diagnostics must not affect production parsing behavior.

---

# 22. Testing Strategy

There are four receipt files in the project's existing `data` directory.

These files are the initial real-world regression corpus.

The implementation agent has access to those files and must inspect them directly when writing the tests.

Do not hardcode assumptions about their contents in this specification.

For each receipt file, the agent must:

1. Inspect the source receipt.
2. Manually determine the expected structured bill data.
3. Create an expected fixture independent of parser output.
4. Run the receipt through the relevant pipeline stages.
5. Assert that parsed results match the manually verified fixture.

The parser's own output must never be used to generate expected test values.

---

# 23. Test Structure

Suggested structure:

```text
data/
├── <existing receipt files>

src/
└── receipt/
    └── ...

tests/
└── receipt/
    ├── fixtures/
    │   ├── receipt1.expected.ts
    │   ├── receipt2.expected.ts
    │   ├── receipt3.expected.ts
    │   └── receipt4.expected.ts
    │
    ├── image/
    │   └── receiptDetector.test.ts
    │
    ├── layout/
    │   ├── lineDetection.test.ts
    │   └── columnDetection.test.ts
    │
    ├── parsing/
    │   ├── numberParser.test.ts
    │   ├── sectionClassifier.test.ts
    │   ├── itemParser.test.ts
    │   └── totalsParser.test.ts
    │
    └── integration/
        └── receiptPipeline.test.ts
```

The exact fixture names should match the actual files already present in the repository where practical.

---

# 24. Parser Unit Tests

The deterministic parser must be testable independently from the OCR model.

Create synthetic `OCRToken[]` fixtures for unit tests covering:

* line reconstruction
* token ordering
* numeric normalization
* numeric OCR correction in numeric context
* item row detection
* wrapped item descriptions
* quantity extraction
* unit price extraction
* item total extraction
* numeric column inference
* subtotal detection
* tax extraction
* multiple tax components
* service/additional charge extraction
* discount extraction
* adjustment extraction
* final total detection
* ambiguous total candidates
* irrelevant metadata containing numbers
* payment information containing amounts
* malformed or incomplete OCR

Unit tests must verify that parser behavior is deterministic.

---

# 25. Tests Using the Four Real Receipt Files

The four receipt files in `data/` must be covered by integration tests.

For every receipt, the tests must verify the applicable stages below.

## 25.1 Region detection

Where applicable:

* a plausible receipt or relevant text region is detected, or
* the pipeline correctly falls back when a confident region cannot be detected.

The test should not require perfect boundary detection if the fallback path still produces a usable result.

---

## 25.2 OCR geometry

Verify:

* OCR returns tokens
* tokens retain bounding boxes
* OCR output can be converted into logical lines

---

## 25.3 Noise and section classification

Verify that relevant bill information is correctly distinguished from irrelevant receipt information.

In particular, the integration tests should ensure that irrelevant text is not incorrectly introduced as purchased items.

---

## 25.4 Item extraction

For each receipt, compare the parsed items against the manually verified expected fixture.

Assert applicable fields including:

* item count
* item names
* quantities
* unit prices where present or reliably derivable
* item totals

Tests should account for fields that genuinely do not exist in a source receipt rather than forcing unsupported expectations.

---

## 25.5 Summary extraction

For each receipt, assert the applicable summary fields based on what is actually present:

* subtotal
* tax components
* aggregate tax
* charges
* discounts
* adjustments
* final total

---

## 25.6 Reconciliation

Where sufficient information is available, verify that:

```text
Parsed item totals
```

reconcile appropriately with:

```text
Parsed subtotal
```

and that the available summary components reconcile with:

```text
Parsed final total
```

If the source receipt itself contains values that do not reconcile, the expected result should reflect that discrepancy rather than altering the data.

---

# 26. Regression Fixtures

Each of the four real receipt files must have a manually verified expected output fixture.

The fixture should contain only values supported by that specific receipt.

It should distinguish between:

* values expected directly from OCR/parsing
* values expected to be derived
* values that are absent

These fixtures form the initial regression suite.

Any future change to:

* image preprocessing
* region detection
* OCR integration
* layout reconstruction
* column detection
* classification
* item parsing
* totals parsing

must be tested against all four receipts to identify regressions.

---

# 27. Test Execution

Separate fast deterministic tests from full OCR integration tests.

Suggested commands:

```text
npm test
```

Runs:

```text
Unit tests
Layout tests
Parser tests
Synthetic OCR fixtures
```

And:

```text
npm run test:receipts
```

Runs the four real receipt files through the full pipeline:

```text
Image
  ↓
Preprocessing
  ↓
Region Detection
  ↓
OCR
  ↓
Layout Reconstruction
  ↓
Section Classification
  ↓
Parsing
  ↓
ParsedBill
```

The exact scripts should follow the existing project test setup rather than introducing unnecessary tooling.

---

# 28. Error Handling and Graceful Degradation

The pipeline must not treat uncertain extraction as a fatal error by default.

Failure modes should degrade through the following levels:

```text
Receipt boundary detection fails
        ↓
Use text-region detection

Text-region detection fails
        ↓
Use normalized full image

Some OCR fields fail
        ↓
Return partial ParsedBill

Some fields are ambiguous
        ↓
Return candidates / low confidence

Mathematical reconciliation fails
        ↓
Report discrepancy

User validation
        ↓
Correct or complete data
```

The objective is to maximize useful extraction while preserving uncertainty.

The pipeline must never fabricate missing receipt data merely to produce a complete bill.

---

# 29. Acceptance Criteria

The OCR and parsing track is complete when the following conditions are met.

## Image processing

* [ ] Receipt processing runs entirely in the browser.
* [ ] The pipeline attempts to detect the receipt or relevant content region.
* [ ] Perspective correction is supported when reliable geometry is available.
* [ ] The pipeline falls back gracefully when region detection fails.
* [ ] The original image remains unchanged.

## OCR

* [ ] OCR is abstracted behind `ReceiptOCR`.
* [ ] OCR output contains text and bounding boxes.
* [ ] The OCR implementation is replaceable.
* [ ] The pipeline supports WebGPU where available with a CPU/WASM fallback.

## Layout

* [ ] OCR tokens are reconstructed into logical lines.
* [ ] Reading order is reconstructed.
* [ ] Numeric token positions can be analyzed as candidate columns.
* [ ] The parser does not rely only on a concatenated text string.

## Classification

* [ ] Receipt lines are classified into logical sections.
* [ ] Item regions are distinguished from metadata and summary regions.
* [ ] Irrelevant metadata is not incorrectly parsed as purchased items.
* [ ] Payment information is not incorrectly parsed as purchased items.
* [ ] Classification retains confidence information.

## Item parsing

* [ ] Item names are extracted.
* [ ] Quantities are extracted when available.
* [ ] Unit prices are extracted or derived when reliable.
* [ ] Item totals are extracted.
* [ ] Wrapped descriptions are supported.
* [ ] Uncertain fields retain confidence and source information.

## Summary parsing

* [ ] Subtotal extraction is supported.
* [ ] Derived subtotals are distinguishable from extracted subtotals.
* [ ] Multiple tax components are supported.
* [ ] Aggregate tax can be calculated.
* [ ] Charges are represented separately from taxes.
* [ ] Discounts and signed adjustments are supported.
* [ ] Final total extraction is supported.
* [ ] Multiple total candidates can be retained in diagnostics.

## Validation and reconciliation

* [ ] Parsed values are never silently modified to force mathematical consistency.
* [ ] Item totals can be reconciled with the subtotal.
* [ ] Summary components can be reconciled with the final total.
* [ ] Discrepancies are reported.

## Testing

* [ ] Synthetic OCR token fixtures cover parser and layout edge cases.
* [ ] All four existing receipt files in `data/` are inspected and used as real integration test inputs.
* [ ] Each receipt has a manually verified expected fixture.
* [ ] Tests verify applicable item extraction for each receipt.
* [ ] Tests verify applicable quantity and price extraction.
* [ ] Tests verify applicable subtotal extraction.
* [ ] Tests verify applicable tax, charge, discount, and adjustment extraction.
* [ ] Tests verify final total extraction.
* [ ] Tests verify reconciliation where sufficient source data exists.
* [ ] All four receipts are included in the regression suite.

---

# 30. Explicit Non-Goals

The following are out of scope for this track:

```text
LLM receipt parsing
Generative AI
Vision-language models
Cloud OCR
Server-side inference
Backend image processing
Automatic fabrication of missing fields
Automatic correction of source values to force totals to match
Custom model training
General-purpose document understanding
Google Sheets integration
Google authentication
Participant claims
Bill splitting
Settlement logic
```

---

# 31. Final Architectural Boundary

The intended architecture is:

```text
Receipt Image
      ↓
Deterministic Image Processing
      ↓
Receipt / Content Region Detection
      ↓
Edge OCR
      ↓
OCR Tokens + Geometry
      ↓
Layout Reconstruction
      ↓
Receipt Section Classification
      ↓
Deterministic Item and Summary Parsing
      ↓
Mathematical Reconciliation
      ↓
ParsedBill + Diagnostics
      ↓
Existing Validation / User Correction
      ↓
ValidatedBill
```

The core implementation principle is:

```text
Computer Vision
+
Edge OCR
+
Bounding-Box Geometry
+
Spatial Analysis
+
Keyword Classification
+
Numeric Parsing
+
Receipt Layout Heuristics
+
Mathematical Reconciliation
```

No generative inference should be introduced into this pipeline. The user remains the final authority through the existing validation and correction flow.
