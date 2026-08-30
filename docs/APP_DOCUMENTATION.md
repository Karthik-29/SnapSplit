# SnapSplit Application Documentation

SnapSplit is a backendless React + TypeScript web app for splitting a restaurant receipt. The app runs entirely in the browser and uses a user-owned Google Sheet as the shared party state.

The current implementation is intentionally small: one bill, one shared Google Sheet, browser-local state while the app is open, and row-level persistence to Google Sheets.

## 1. High-Level Architecture

```mermaid
flowchart LR
  User[User in browser] --> React[React SPA]
  React --> Auth[Google Identity Services]
  React --> ImagePipeline[Image preprocessing + region detection]
  ImagePipeline --> OCR[Tesseract OCR]
  OCR --> Layout[Layout: lines + numeric columns]
  Layout --> Parser[Receipt parser: sections, items, totals]
  Parser --> AppState[AppContext bill state]
  AppState --> Reconcile[Live items-vs-total reconciliation]
  AppState --> Calc[Bill calculation]
  AppState --> Sync[PartySync]
  Sync --> SheetsAPI[Google Sheets API]
  SheetsAPI --> Sheet[(Google Sheet)]
  Sheet --> Load[loadParty]
  Load --> AppState
```

There is no SnapSplit backend. Google provides persistence and per-file authorization:

- Google OAuth grants SnapSplit access only to Google Sheets selected through Google Picker.
- Google Sheets stores the party data.
- React context stores the live in-browser bill state.
- `PartySync` watches local state and writes changes back to the remote Sheet.

## 2. Current Product Flow

```mermaid
flowchart TD
  Start[Open SnapSplit] --> PartyChoice[Choose Create Party or Join Party]

  PartyChoice --> Create[Create Party]
  PartyChoice --> Join[Join Party]

  Create --> PickEmptySheet[Choose empty Sheet in Google Picker]
  PickEmptySheet --> InitSheet[initializeParty creates SnapSplit tabs]
  InitSheet --> LoadCreated[loadParty reads Sheet]

  Join --> PickSharedSheet[Choose shared Sheet in Google Picker]
  PickSharedSheet --> LoadJoined[loadParty reads Sheet]

  LoadCreated --> RestoreState[restoreState into AppContext]
  LoadJoined --> RestoreState
  RestoreState --> Upload[Upload receipt]
  Upload --> OCR[Run OCR]
  OCR --> Parse[Parse receipt items and totals]
  Parse --> Review[Review/edit items]
  Review --> Participants[Manage participants]
  Participants --> Claims[Claim items]
  Claims --> Settlement[View participant shares]
  Settlement --> Export[Google Sheets Party page]

  RestoreState --> AutoSync[PartySync autosaves edits]
  Review --> AutoSync
  Participants --> AutoSync
  Claims --> AutoSync
  AutoSync --> RemoteSheet[(Remote Google Sheet)]
```

The party screen appears before receipt upload. Each user must select the shared Sheet in Google Picker. This establishes per-file access under the `drive.file` scope; bill edits made after that point can be saved to the party Sheet.

**Role gates Upload.** Creating a party sets `role: 'owner'`; joining an existing one sets `role: 'participant'` (see `Party` in [party.ts](../src/google/party.ts)). Only an owner sees the Upload link and lands on the upload screen at `/`; a participant lands on Review instead, since the owner's receipt already exists there and a participant re-uploading would silently overwrite the shared bill via `PartySync`. This is a client-side UI hint only — it is never written to the Sheet, and Drive/Sheets sharing permissions remain the actual access control.

The Review step is where the user corrects OCR mistakes: item names, quantities, and unit prices are editable inline, and the receipt's own subtotal/total are now also directly editable (see §8, `checkItemsAgainstReceiptTotal`) rather than being a fixed, un-correctable value carried over from OCR. Review also holds two discount fields — **Receipt discount** (one already printed on the bill) and **Discount** (one the group adds on top) — each a flat ₹ amount or a percentage of the subtotal, distributed across participants in proportion to their share (see §11).

## 3. State Model

The main app state is `BillState` from `src/bill/models.ts`.

```ts
type BillState = {
  receiptItems: BillItem[];
  receiptSubtotal?: number;
  receiptTotal?: number;
  receiptDiscount?: BillDiscount; // already printed on the receipt
  discount?: BillDiscount;        // applied by the group on top
  participants: Participant[];
  itemClaims: ItemClaim[];
};
```

Important domain types:

- `BillItem`: one receipt line item with `id`, `name`, `quantity`, `unitPrice`, and `totalPrice`.
- `Participant`: one person in the bill with `id` and `name`.
- `ItemClaim`: how an item is assigned, either individually by quantity or shared equally among selected participants.
- `BillDiscount`: `{ type: 'amount' | 'percent'; value: number }`. `amount` is a flat value in major units; `percent` is a percentage of the receipt subtotal. Used for two distinct fields: `discount` (a reduction the group applies on top of the receipt) and `receiptDiscount` (one already printed on the bill and baked into `receiptTotal`). Both are edited on the Review screen and distributed across participants in proportion to their pre-discount share (see §11); they differ only in the tax derivation (§11).
- `BillCalculationResult`: calculated totals, tax, the total applied `discount` amount (receipt + group), the `receiptDiscount` portion, participant summaries, and settlement lines.

## 4. Google Sheet Data Model

A SnapSplit party is represented by one Google spreadsheet with four tabs:

| Tab | Purpose | Columns |
| --- | --- | --- |
| `META` | Schema and party metadata | `key`, `value` |
| `USERS` | Participants | `user_id`, `name` |
| `ITEMS` | Receipt items | `item_id`, `name`, `quantity`, `unit_price`, `total_price` |
| `CLAIMS` | Item claims | `item_id`, `user_id`, `quantity`, `mode` |

The current schema version is `1`, stored in `META` as:

```text
schema_version        | 1
currency              | INR
created_at            | ISO timestamp
discount_type         | amount | percent | (blank)
discount_value        | number | (blank)
receipt_subtotal      | number | (blank)
receipt_total         | number | (blank)
receipt_discount_type | amount | percent | (blank)
receipt_discount_value| number | (blank)
```

`discount_type` / `discount_value` hold the whole-bill discount **the group applies on top of the receipt**. They are written by `syncParty` and read back by `loadParty` (via `parseDiscount`); a blank value, missing rows, or an unrecognised type all read back as "no discount". `receipt_subtotal` / `receipt_total` hold the printed bill subtotal and grand total so the derived tax survives a reload for anyone who joins the party; written by `syncParty`, read by `loadParty` (via `parseAmountMeta`), and a blank / missing / non-numeric / negative value reads back as "not set". `receipt_discount_type` / `receipt_discount_value` hold a discount **already printed on the receipt** (baked into `receipt_total`) — same `{amount|percent, value}` shape as the group discount, read by `parseReceiptDiscount`, which unlike `parseDiscount` **throws** on a present-but-malformed value (unknown type, non-numeric, negative, or a percentage above 100). Adding these keys did **not** bump the schema version — `META` is key/value and older parties simply lack the rows.

The two discounts are kept separate because they need opposite treatment when tax is derived: the receipt discount is added back (`grossTotal = receipt_total + receiptDiscount`; `tax = max(0, grossTotal − receipt_subtotal)`), then both discounts come out of the same distributed pool so `totalBill` = `receipt_total − groupDiscount`.

The spreadsheet ID comes from a Google Sheets URL like:

```text
https://docs.google.com/spreadsheets/d/<spreadsheet-id>/...
```

## 5. Authentication and Authorization

Authentication code lives in `src/google/auth.ts`.

The browser OAuth client ID is hardcoded in `src/google/auth.ts`:

```ts
export const GOOGLE_CLIENT_ID = '<public OAuth client ID>';
```

Only a public OAuth client ID is used. There is no client secret in the browser app.

The app requests this least-privilege Drive scope:

```text
https://www.googleapis.com/auth/drive.file
```

`drive.file` grants access only to files the user selects through Google Picker or creates with SnapSplit. SnapSplit does not receive access to the user's other Sheets or Drive files.

Google Picker also requires the Google Picker API and Google Sheets API to be enabled, a browser API key restricted to SnapSplit's origins, and the Cloud project number as the Picker app ID.

Google Sheet sharing is not managed by SnapSplit. The party owner should share the Sheet with friends as Editors, or use link sharing if appropriate. Each friend must open SnapSplit, choose **Choose Google Sheet**, and select that same Sheet. A link-only Sheet may not appear in Picker until it is shared directly or added to the user's Drive.

### Account selection

`requestGoogleAccessToken()` explicitly passes `prompt: 'select_account'` to `requestAccessToken()`. Without it, Google's token client silently reuses whichever account already has a session in the browser, with no way to switch — a real problem for this app specifically, since there is no separate SnapSplit session and every distinct Google identity interaction (the party owner creating a Sheet, or a participant signing in independently) should let the person confirm which account they mean, rather than an app-level "current user" being assumed for them.

Note that `AuthContext.getAccessToken()` caches the resulting token in React state for the lifetime of the page load. The account picker only has a chance to run again once that cache is empty — a fresh page load, or after `signOut()`. Repeated Google-auth actions within the same loaded page (e.g. testing "switch account" without reloading) will keep reusing the first token obtained.

### Troubleshooting: `Error 400: origin_mismatch`

This means Google's OAuth server rejected the request because the browser's current origin (scheme + host + port) is not in the **Authorized JavaScript origins** list configured for `GOOGLE_CLIENT_ID` in Google Cloud Console (APIs & Services → Credentials). This check happens before any account picker is shown, so it can look like "no picker appears" even in incognito. Fix it in Cloud Console, not in code:

- Add the exact origin shown in the browser's address bar — no trailing slash, no path.
- Google treats `localhost`, `127.0.0.1`, and a LAN IP as three different origins, even on the same machine. Since [`vite.config.ts`](../vite.config.ts) binds to `0.0.0.0`, confirm which one the browser is actually using.
- Changes usually take effect within a few minutes.

This is a Google Cloud project setting, not something the app's source code can work around.

## 6. Module Map

```text
src/
  App.tsx                    Route shell, brand header + nav, and party gate
  main.tsx                   React bootstrap and provider composition
  styles.css                 Whole-app stylesheet: design tokens + light/dark theme (see §16)

  context/
    AppContext.tsx           Live bill state and state mutation functions (items, totals, participants, claims)
    AuthContext.tsx          Google OAuth token access
    PartyContext.tsx         Current connected Sheet-backed party

  google/
    auth.ts                  Google Identity Services and OAuth token handling
    party.ts                 Sheet schema, load, initialize, and sync operations; Party.role (client-side only, see §2)

  receipt/
    models.ts                Receipt, OCR, RgbaImage, and bill item types
    pipeline.ts              inferReceiptBill: image -> OCR -> ParsedBill, the canonical entry point
    ocr.ts                   Tesseract OCR implementation (realReceiptOCR)
    tesseractTokens.ts       Shared Tesseract-word -> OCRToken mapping (browser + Node harness)
    parser.ts                Thin legacy adapter: ParsedBill -> major-unit BillItem[] for the UI

    image/                   Deterministic, non-ML image preprocessing (spec-mandated: no LLM/VLM/cloud OCR)
      settings.ts              Single source of truth for preprocessing options (shared by browser + Node tests)
      decode.ts                Browser image decoder (canvas); Node has its own test-only decoder
      resize.ts                Pure-JS box-filter resize, used by both browser and Node so pixels match exactly
      preprocess.ts            Decode -> resize -> grayscale/contrast
      receiptDetector.ts       Finds the receipt as a bright, low-saturation, roughly solid region (on the COLOR image)
      crop.ts                  Crops RgbaImage to a detected region; encodes to PNG for the OCR engine
      normalize.ts             Orchestrates detect -> crop -> preprocess for one receipt image
      illumination.ts          Flat-field/shadow correction (true sliding-window box blur) -- implemented and
                                 empirically swept against all four real photos, but disabled by default: no tested
                                 configuration beat "off" without regressing at least one other receipt (see §8)
      perspective.ts           Perspective correction for a detected quadrilateral -- unused: nothing currently
                                 produces a quadrilateral to feed it (dead code, kept for a future pass)

    layout/                  Reconstructs spatial structure from OCR tokens
      lineDetection.ts         Groups tokens into visual lines by vertical position
      columnDetection.ts       Clusters numeric tokens into columns; identifies the dominant "amount" column
      normalizeTokens.ts       Token/bounding-box normalization helpers

    parsing/                 Deterministic classification and item/total extraction
      numberParser.ts          parseMoney (context-sensitive OCR digit correction) and parseQuantity
      keywordMatcher.ts        Summary keyword table, receipt-metadata detection, item-header detection
      sectionClassifier.ts     Classifies each line: item / subtotal / tax / total / footer / etc.
      receiptParser.ts         The real parser: parseReceipt(OCRResult) -> ParsedBill

  bill/
    models.ts                Bill, participant, claim, settlement, discount types; BillCalculationResult.itemsNeedingReview
    claims.ts                Claim helpers and default claim construction
    splitting.ts             Item splitting helpers: capIndividualQuantities (over-claim capping), distributeProportionally (tax/discount)
    settlement.ts            Per-participant bill calculation; proportional tax + receipt & group discounts; flags over-claimed items
    reconciliation.ts        checkItemsAgainstReceiptTotal: live items-vs-receipt-total + totalBelowSubtotal check for Review
    review.ts                runReviewChecks: pass/warn/fail arithmetic sanity checks for the Settlement screen

  routes/
    PartyPage.tsx            Create/join/refresh party screen
    ReceiptUploadPage.tsx    Route wrapper for receipt upload
    ReceiptReviewPage.tsx    Route wrapper for receipt review
    ParticipantsPage.tsx     Route wrapper for participant management
    ItemClaimPage.tsx        Route wrapper for item claiming
    SettlementPage.tsx       Route wrapper for bill result
    SheetExportPage.tsx      Route wrapper for Sheet status

  components/
    Logo.tsx                 SnapSplit mark: inline SVG, drawn in currentColor (see §16)
    PartySync.tsx            Debounced autosync from AppContext to Google Sheet
    ReceiptUpload.tsx        Upload image, run inferReceiptBill, convert via toLegacyReceipt
    ReceiptReview.tsx        Edit parsed items, receipt subtotal/total, receipt discount, and the group discount (₹/%); live mismatch + totalBelowSubtotal warnings
    Participants.tsx         Add/remove people
    ItemClaim.tsx            Individual/shared item claiming UI
    Settlement.tsx           Receipt-style Summary card (subtotal / tax / discount rows, bold "amount paid" line), calculated participant shares, and the runReviewChecks pass/warn/fail list
    SheetExport.tsx          Show current Google Sheet party connection

  tests/
    *.test.ts                Unit tests for parsing, claims, splitting, settlement, reconciliation, review
    receipt/
      parsing/               Number parsing, section classification, item/quantity/total edge cases
      layout/                Line reconstruction and column detection
      image/                 Region detection (synthetic RgbaImage fixtures)
      support/               Node-only OCR/image test harness (never bundled into the app)
      fixtures/              Manually verified expected values + committed real captured OCR fixtures
      integration/           Real-fixture regression + OCR accuracy scoring suites
```

## 7. Provider and Routing Structure

`src/main.tsx` composes the app providers:

```mermaid
flowchart TD
  BrowserRouter --> AuthProvider
  AuthProvider --> PartyProvider
  PartyProvider --> AppProvider
  AppProvider --> App
```

Provider responsibilities:

- `AuthProvider` owns the Google OAuth access token.
- `PartyProvider` owns the currently connected party, if any.
- `AppProvider` owns live bill state and exposes mutation functions.

`src/App.tsx` gates the workflow:

- If no party is connected, `/` renders `PartyPage`.
- If a party is connected and `party.role === 'owner'`, `/` renders `ReceiptUploadPage`; otherwise (a participant who joined) `/` renders `ReceiptReviewPage`, since the owner's receipt already exists and re-uploading would overwrite it via `PartySync`.
- Workflow routes are shown in navigation only after a party is open; the Upload link itself is shown only for `role === 'owner'`.
- `/party` is always available so users can create, join, refresh, or view the current party.

The header renders a brand lockup (`<Logo>` + "Snap**Split**" wordmark) linking to `/`, and the nav uses `react-router-dom`'s `NavLink` (`className="nav-link"`, `end` on the `/` link) so the current route is highlighted. Visual styling of the shell, header, and every screen is described in §16.

## 8. Key Functions by Module

### `src/google/auth.ts`

`requestGoogleAccessToken()`

Creates a Google OAuth token client and requests an access token for the `drive.file` scope, passing `prompt: 'select_account'` so Google always shows the account chooser instead of silently reusing whatever account already has a browser session (see §5, Account selection).

`pickGoogleSpreadsheet(token)`

Opens Google Picker filtered to spreadsheets and returns the ID of the file explicitly selected by the user.

`revokeGoogleAccessToken(token)`

Revokes the current OAuth token during sign-out.

`ensureOAuthClient()`

Initializes the OAuth token client used for Sheets API access.

### `src/google/party.ts`

`extractSpreadsheetId(url)`

Legacy URL parser retained for compatibility; the active party flow receives spreadsheet IDs from Google Picker instead.

`initializeParty(token, spreadsheetId)`

Turns a pristine empty Google Sheet into a SnapSplit party:

- Reads spreadsheet metadata.
- If the Sheet already has valid SnapSplit `META` schema version `1`, returns without changing it.
- Refuses to initialize non-empty or unfamiliar spreadsheets.
- Renames `Sheet1` to `META`.
- Adds `USERS`, `ITEMS`, and `CLAIMS`.
- Writes headers and metadata.

`loadParty(token, spreadsheetId)`

Reads a SnapSplit Sheet and reconstructs `BillState`:

- Validates required tabs exist.
- Validates `META.schema_version` is `1`.
- Reads `USERS`, `ITEMS`, and `CLAIMS`.
- Converts Sheet rows into participants, receipt items, and item claims.
- Reconstructs the group discount from `META.discount_type` / `discount_value` via `parseDiscount` (blank/missing/unrecognised → no discount).
- Reconstructs `receiptSubtotal` / `receiptTotal` from `META.receipt_subtotal` / `receipt_total` via `parseAmountMeta` (blank/missing/non-numeric/negative → not set).
- Reconstructs `receiptDiscount` from `META.receipt_discount_type` / `receipt_discount_value` via `parseReceiptDiscount` (blank/missing → not set; **throws** on a malformed value).
- Returns `Omit<Party, 'role'>` — the Sheet has no concept of role, so the caller (`PartyPage`, based on whether it called this after create or join) attaches `role` itself.

`syncParty(token, party)`

Writes current app state to the remote Google Sheet:

- Upserts the `discount_type` / `discount_value` / `receipt_subtotal` / `receipt_total` / `receipt_discount_type` / `receipt_discount_value` rows into `META` (only these keys — `schema_version`, `currency`, `created_at` are untouched).
- Upserts participant rows into `USERS`.
- Upserts item rows into `ITEMS`.
- Upserts claim rows into `CLAIMS`.
- Uses row keys so unchanged rows are skipped.

`parseDiscount(meta)`

Pulls `discount_type` / `discount_value` out of the `META` rows and returns a `BillDiscount` only when the type is `amount` or `percent` and the value is a finite number greater than 0; otherwise `undefined`.

`parseReceiptDiscount(meta)`

Pulls `receipt_discount_type` / `receipt_discount_value` out of `META`. Blank/missing → `undefined`. A present value that is not `amount`/`percent`, not finite, negative, or a `percent` above 100 **throws** `"This SnapSplit party has an invalid receipt discount …"` — because this figure feeds the tax derivation, a nonsensical value is treated as a data error to fix rather than silently ignored. The Review UI caps a percentage at 100 on entry, so a throw only results from an out-of-band edit to the Sheet.

`syncRows(token, id, sheet, keyIndexes, desired)`

Shared helper used by `syncParty`. It reads existing rows, builds stable keys, updates rows that changed, and appends rows that do not exist yet.

`request(token, path, options)`

Low-level Sheets API request helper. Adds auth headers, JSON content type, and converts access errors into user-friendly messages.

`metadata(token, id)`

Fetches spreadsheet tab metadata.

`getValues(token, id, range)`

Reads values from a Sheet range.

`batch(token, id, requests)`

Sends a Sheets `batchUpdate` request, used for structural changes like adding tabs.

`update(token, id, range, values)`

Writes values to a specific range.

`append(token, id, range, values)`

Appends rows to a range.

### `src/context/AppContext.tsx`

`addParticipant(name, id?)`

Adds a participant. If an ID is supplied, it uses that ID; otherwise it creates a local `user-<timestamp>` ID. It also adds default zero quantities for the new participant to existing individual claims.

`removeParticipant(participantId)`

Removes a participant and removes that participant from all individual and shared claims.

`setParticipants(participants)`

Replaces the participant list and prunes claims so they only reference active participants.

`restoreState(state)`

Loads a full bill state into React state. Used after `loadParty` reads the Sheet.

`updateBillItem(item)`

Updates an existing receipt item.

`setBillItems(items, totals?)`

Replaces receipt items after OCR/parse or another bulk load. Existing matching claims are preserved, obsolete item claims are removed, and default claims are created for new items.

`updateReceiptTotals(totals)`

Updates `receiptSubtotal`/`receiptTotal` independently of the item list. Unlike `setBillItems` (called once, at OCR time), this is what lets the Review screen correct a total OCR got wrong or never found — each field can be edited without clobbering the other.

`updateReceiptDiscount(discount)`

Sets or clears `receiptDiscount` — a discount already printed on the receipt (`BillDiscount`; flat ₹ or a % of the subtotal). Same `undefined`-when-empty rule as `updateDiscount`. Edited from the Review screen's **Receipt discount** field, which caps a percentage at 100 on entry.

`updateDiscount(discount)`

Sets or clears the group discount (a reduction applied on top of the receipt). A cleared, zero, or negative discount is normalised to `undefined` so the rest of the app has one "no discount" representation. Edited from the Review screen's **Discount** field.

`addBillItem()`

Creates a new manual receipt item and a default individual claim for it.

`removeBillItem(itemId)`

Removes an item and its claim.

`updateItemClaim(claim)`

Replaces the claim for one item.

`calculationResult`

Memoized result from `calculateBillResults`, recomputed whenever items, participants, claims, subtotal, total, or discount change.

### `src/context/AuthContext.tsx`

`getAccessToken()`

Returns a cached token if available, otherwise requests a new Google OAuth token.

`signOut()`

Revokes the access token if present and clears auth state.

### `src/context/PartyContext.tsx`

`setParty(party)`

Stores or clears the currently connected party. A party contains a `spreadsheetId` and the loaded `BillState`.

`usePartyContext()`

Accesses the party context and throws if used outside `PartyProvider`.

### `src/components/PartySync.tsx`

`PartySync()`

Runs as an invisible component mounted by `App`. When a party is connected, it watches `AppContext.state`, waits 250ms after a change, gets an access token, and calls `syncParty`.

The component does not block UI editing if sync fails. It logs the error, leaving the latest edits in local browser state.

### `src/routes/PartyPage.tsx`

`PartyPage()`

Controls the Create Party and Join Party flow:

- Opens Google Picker filtered to spreadsheets.
- Uses the selected spreadsheet ID.
- Calls `initializeParty` only for create mode.
- Calls `loadParty` for both create and join modes.
- Calls `restoreState` and `setParty`.
- Offers refresh from Sheet for an already connected party.

### `src/receipt/pipeline.ts` — canonical image-to-bill entry point

`inferReceiptBill(image, ocr, options?)`

The real entry point used by `ReceiptUpload.tsx`. Normalizes the image (decode -> detect region -> crop -> preprocess), runs the given `ReceiptOCR` implementation, then calls `parseReceipt` on the result and attaches the detected region to diagnostics. Accepts either a `Blob` (a real photo) or an already-decoded `RgbaImage` (used by the Node test harness, so the exact same code path runs in both places).

### `src/receipt/image/` — deterministic image preprocessing (no ML, per the product spec)

`preprocessReceiptImage(source, options?, decode?)` ([preprocess.ts](../src/receipt/image/preprocess.ts))

Decodes, resizes (with `RECEIPT_PREPROCESSING.minDimension`/`maxDimension` from [settings.ts](../src/receipt/image/settings.ts)), and applies grayscale/contrast. The decoder is injectable so the same function runs against a browser `canvas` decoder or a Node-only test decoder.

`detectReceiptRegion(image)` ([receiptDetector.ts](../src/receipt/image/receiptDetector.ts))

Finds the receipt as the largest bright, low-saturation, roughly-solid-rectangle region in the **color** image (must run before grayscale conversion, since saturation is the signal that separates paper from skin/wood/tile backgrounds). Falls back to the full image when no region is confidently found — region detection failing must never block OCR.

`normalizeReceiptImage(source, options?, decode?)` ([normalize.ts](../src/receipt/image/normalize.ts))

Orchestrates detect -> crop (only above a confidence threshold) -> preprocess for one image. This is what `inferReceiptBill` calls.

`cropImageData(source, bounds)` / `resizeImage(source, width, height)`

Pure pixel operations shared by both the browser and the Node fixture-capture harness. **Decoding itself is not shared** — the browser decodes via `createImageBitmap`+canvas ([decode.ts](../src/receipt/image/decode.ts)) while the Node harness uses its own codecs ([nodeImage.ts](../src/tests/receipt/support/nodeImage.ts)) — and for JPEGs this used to be a real, silent divergence: a pure-JS reference decoder (`jpeg-js`) produced measurably different pixels than a browser's own decoder, confirmed by a literal OCR-text mismatch against a live browser session for the same file. Fixed by switching the Node harness's JPEG decoding to `@jsquash/jpeg` (a WASM build of mozjpeg), after which Node's output matched the browser's exactly for the file it was checked against. WebP decoding (`@cwasm/webp`) was never in question and is unaffected. See §14 for the accuracy-number recalibration this required.

`correctIllumination(image, options?)` ([illumination.ts](../src/receipt/image/illumination.ts))

Flat-field correction: divides each pixel by a heavily-blurred estimate of the local background (a true separable sliding-window box blur, not a resize-based approximation — an earlier resize-downscale/upscale version produced a large apparent win at one exact pixel size that vanished at neighboring sizes, a resampling-grid artifact rather than a real effect), then rescales toward a canonical paper brightness. A `shadowOnlyThreshold` option limits correction to pixels whose local background sits meaningfully below target, leaving already-fine regions untouched. **Implemented and swept against all four real photos, but disabled by default** ([settings.ts](../src/receipt/image/settings.ts)): every configuration that helped the one genuinely shadowed receipt (`test_bill-2.jpeg`) measurably hurt at least one of the other three, and a background-variance-based gate was tried and found not to cleanly separate "needs correction" from "doesn't" either. Kept as real, working, tested tooling for a future attempt (e.g. per-region rather than global gating), not shipped on a hunch.

`perspective.ts` is currently dead code: it can rectify a quadrilateral, but nothing in the pipeline detects one to feed it. A future pass could wire quad detection in for skewed photos.

### `src/receipt/layout/` — reconstructing structure from OCR tokens

`detectLines(tokens)` ([lineDetection.ts](../src/receipt/layout/lineDetection.ts))

Groups tokens into visual lines using a running mean of each row's vertical center (not the row's growing bounding box, which previously caused one tall token to snowball into merging unrelated rows together).

`detectNumericColumnsDetailed(lines)` / `detectAmountColumn(lines)` ([columnDetection.ts](../src/receipt/layout/columnDetection.ts))

Clusters numeric tokens by right-edge position. `detectAmountColumn` derives the column from where each line's *last* amount actually sits (not every numeric token on the page, which lets right-margin OCR noise form a denser false column) and only returns a result when one cluster clearly dominates — an uncertain column is worse than none, since committing to the wrong one rejects every genuine item row.

### `src/receipt/parsing/receiptParser.ts` — the real parser

`parseReceipt(result: OCRResult): ParsedBill`

The core deterministic parser. For each visual line:

1. `classifyLine` (see below) assigns a section: `item`, `subtotal`, `tax`, `service_charge`, `discount`, `adjustment`, `total`, `payment`, `footer`, `header`, or `unknown`.
2. Lines are buffered (`pendingLines`) until an **anchor** line closes out an item — either a line classified `item` with its amount aligned to the detected amount column, or (for narrow receipts) a run of consecutive bare-numeric lines aligned to that column, so a quantity/rate/total split across separate physical lines still resolves into one item.
3. `resolveQuantityAndRate` assigns quantity/rate/total roles **positionally** over the anchor's own numeric values — never by searching buffered/merged text for "a number that happens to fit," which is what previously let a printed rate get mistaken for a quantity. It also cross-validates an independently-read rate against the total and detects the specific case of a ~100x inflated/deflated total (a dropped or hallucinated decimal point), trusting the rate over a total known to be corrupted rather than deriving a wrong unit price — the total itself is never silently rewritten.
4. A second pass over all classified lines extracts subtotal, tax components, charges, adjustments, and ranks total candidates by confidence, then reconciles `subtotal + tax + charges + adjustments` against the selected total (`ParsedBill.reconciliation`).

Only bare-numeric lines (no letters at all) ever contribute a numeric value to an item; a line mixing a name with a stray number (e.g. a wrapped-name line with OCR noise) contributes only its text, never its number — this is what stops metadata or noise digits from leaking into quantity/price.

`amountsOf`'s candidate-token filter requires a token to be **predominantly numeric** (`isAmountLikeToken`), not merely digit-containing. This closed a real bug found against a real photo: OCR misread the name "BLACK" as "34K" (a name fragment, not an amount), and the old `/\d/`-only filter let it through as a candidate value, corrupting that row's positional quantity/rate assignment. The same filter also stopped discarding a genuine amount outright just because it ends in `%`: `isRateAnnotation` now only excludes a token shaped like a genuine rate annotation (`@2.5%`, no currency symbol) rather than any token containing `%`/`@` at all, which previously threw away a real subtotal that OCR'd as `"$45.8%"` (its printed `$45.85`, with the final `5` misread as `%`) — the token is still handed to `parseMoney` and the recovered value is honestly short by the one lost digit, not fabricated back.

`parseItem`'s `MAX_PLAUSIBLE_ITEM_QUANTITY` (50) rejects a whole row outright when its resolved quantity exceeds it — not just the quantity field, the entire row, since `resolveQuantityAndRate`'s own cross-validation (`quantity * rate == total`) is exactly the evidence that made an implausible row look trustworthy in the first place. This closed a real bug: a garbled non-item line on a real receipt (likely a mangled summary/footer row) read as "200 75.00 15000" — internally consistent (200 × 75.00 = 15000 exactly) and therefore invisible to any arithmetic sanity check — was parsed as a genuine ₹15,000 phantom item. No real receipt in `realReceiptFixtures.ts` prints a line-item quantity above 4, so 50 leaves wide, deliberate margin.

### `src/receipt/parsing/sectionClassifier.ts`

`classifyLine(line, seenSummary)`

Classifies one line using, in order: item-header detection, summary keyword matching ([keywordMatcher.ts](../src/receipt/parsing/keywordMatcher.ts)), metadata detection (table/phone/GSTIN/date-shaped lines), then a letters/digits fallback. Keyword matching alone is never sufficient — a heading like "Cash Memo" printed above the items must not flip the parser into "summary already seen" mode before the first item.

### `src/receipt/parsing/numberParser.ts`

`parseMoney(input)` — context-sensitive OCR digit correction (O/o/I/l -> 0/1, only where it's unambiguous) into integer minor units, with thousands/decimal separator handling.

`parseQuantity(input)` — accepts only integer-like values (spec: quantities are positive integers), never confused with a money value since callers choose which one to read based on position, not on the string's shape alone.

### `src/receipt/ocr.ts`

`realReceiptOCR.extract(image)`

Runs Tesseract OCR. Accepts either a `Blob` (normalizes it first via `normalizeReceiptImage`) or an already-normalized `RgbaImage`. Word-to-token mapping is shared with the Node test harness via [tesseractTokens.ts](../src/receipt/tesseractTokens.ts) so a captured fixture has the exact token shape the app sees.

`ensureWorkerReady()` explicitly points `createWorker`'s `langPath` at `public/eng.traineddata.gz` (served from the site root) instead of leaving it at tesseract.js's default — `https://tessdata.projectnaptha.com/4.0.0`, a third-party CDN with **no relationship to this repo's own committed `eng.traineddata`**, the exact file the Node capture harness ([nodeOcr.ts](../src/tests/receipt/support/nodeOcr.ts)) loads and every OCR-quality score in this repo is measured against. Before this fix, every accuracy number this repo tests for described a model the browser never actually used, so real browser OCR quality could differ substantially — often worse — from what `npm run test:receipts` reports, with no test able to catch it. `public/eng.traineddata.gz` is a gzip of the exact same repo-root file (regenerate with `node -e "require('zlib').gzipSync(...)"` if `eng.traineddata` is ever updated — see the comment in `ocr.ts`). `cachePath` is also set to a distinct value so a browser that already cached the old CDN-fetched model in IndexedDB fetches the local one instead of silently reusing the stale entry.

### `src/receipt/parser.ts` — legacy major-unit adapter

`toLegacyReceipt(parsed, rawText?)`

The **only** place minor units convert to the major units (`BillItem`) the rest of the UI expects. An absent OCR quantity is surfaced as `1` here only — `ParsedBill` itself retains `null` and low confidence, since the spec requires never inventing a quantity without evidence.

`parseReceiptData(result)` / `parseReceiptLines(result)`

Convenience wrappers: `parseReceipt` -> `toLegacyReceipt`.

### `src/bill/claims.ts`

`getClaimedQuantity(claim, participantId)`

Returns how many units a participant individually claimed for an item.

`getTotalClaimedQuantity(claim)`

Returns the sum of all individual quantities in a claim.

`getRemainingQuantity(item, claim)`

Returns how many units remain unclaimed for an item.

`isClaimValid(item, claim)`

Returns whether claimed quantity is less than or equal to item quantity.

`buildDefaultClaim(item, participantIds)`

Creates a default individual claim with zero quantity for each participant.

### `src/bill/splitting.ts`

`roundToCents(value)`

Currently rounds to the nearest whole number. Despite the name, this behaves like rupee/integer rounding rather than two-decimal cent rounding.

`splitSharedItemEvenly(item, participantIds)`

Splits an item total evenly across selected participants. Any whole-number remainder is assigned to earlier participants in the list.

`calculateIndividualShares(item, claimQuantities)`

Multiplies each participant's claimed quantity by the item unit price. Calls `capIndividualQuantities` first (below), so a claim that's since become too large for the item never inflates the calculated share.

`capIndividualQuantities(item, claimQuantities)`

If the claimed quantities sum to more than `item.quantity` — e.g. the item's quantity was edited down in Review after claims already existed — proportionally scales every participant's claimed quantity down to fit, using the same `Math.floor` base-share-plus-remainder rule as `splitSharedItemEvenly`, so the scaled quantities sum exactly to `item.quantity`. This is a **calculation-time view only**: the stored `ItemClaim` is never mutated, since silently rewriting what a specific participant is recorded as having claimed would be worse than a visibly-flagged discrepancy (see `itemsNeedingReview` below). Returns `claimQuantities` unchanged when there's no over-claim.

`distributeProportionally(pool, weightById, orderedIds, totalWeight)`

Splits `pool` across `orderedIds` in proportion to each id's weight, rounding each share to 2 decimals and pushing the leftover rounding remainder onto the **last** id so the parts sum back to `pool` exactly. `totalWeight` is passed explicitly rather than summed from `weightById`, because tax and discount are both allocated against the item subtotal, which is not necessarily the sum of the per-participant shares. Returns `{}` for a non-positive pool or zero total weight. Used for both the proportional tax and the proportional discount in `calculateBillResults`.

### `src/bill/settlement.ts`

`calculateBillResults(items, participants, itemClaims, receiptTotals?, discount?)`

Calculates the bill summary:

- Builds per-participant item shares.
- Uses shared mode to split items equally among selected participants.
- Uses individual mode to multiply claimed quantities by unit price (capped via `capIndividualQuantities` when over-claimed).
- Detects, per individual-mode claim, whether `getTotalClaimedQuantity(claim) > item.quantity` and collects those items into `BillCalculationResult.itemsNeedingReview: Array<{ id, name }>`, surfaced as a warning in `Settlement.tsx`.
- Computes item subtotal.
- Uses receipt subtotal and total when available.
- Resolves `receiptTotals.discount` (the receipt's own printed discount) to a rupee figure via `resolveDiscountValue` (percentage off the receipt subtotal, clamped to 100%, floored at 0), adds it back to the total (`grossTotal = receiptTotal + receiptDiscount`), and treats `grossTotal - subtotal` as tax/extra charges when positive.
- Allocates tax proportionally to each participant's item share (via `distributeProportionally`).
- Resolves the group `discount` via `resolveDiscountAmount` (percentage off the receipt subtotal, negatives ignored, capped at what participants still owe after the receipt discount). The **combined** pool `receiptDiscount + groupDiscount` is allocated by the **same** pre-tax item-share ratios as tax and subtracted from each participant's share. Returned as `BillCalculationResult.discount` (total) plus `BillCalculationResult.receiptDiscount` (the receipt portion); `totalBill = grossTotal - discount` (which reduces to `receiptTotal - groupDiscount`).
- Returns participant summaries; `sum(participantSummaries.share)` always equals `totalBill` — the tax and discount pools are each distributed with the rounding remainder absorbed on the last participant, and over-quantity claims are capped before shares are computed.

`settlements` is currently returned as an empty array. The app shows participant shares, but it does not yet compute payment transfer recommendations.

### `src/bill/review.ts`

`runReviewChecks({ result, items, receiptSubtotal?, receiptTotal?, receiptDiscount?, discount?, participantCount, itemClaims? })`

Pure function (mirrors `reconciliation.ts`) that runs a set of arithmetic sanity checks over a finished `BillCalculationResult` for the Settlement ("final review") screen. Returns one `ReviewCheck` (`{ id, label, status: 'pass' | 'warn' | 'fail', detail? }`) per invariant:

| id | fails / warns when |
| --- | --- |
| `shares-add-up` | **fail** — `sum(shares)` is more than ₹0.01 off `totalBill` |
| `no-negative-shares` | **fail** — any participant share is below 0 |
| `has-participants` | **fail** — the bill has no participants |
| `receipt-discount-in-full` | **warn** — a receipt discount is set but resolved to more than participants owe and had to be capped (only emitted when a receipt discount is set) |
| `discount-in-full` | **warn** — the group discount is set but was capped below the requested amount (only emitted when a group discount is set) |
| `items-match-receipt` | **warn** — `checkItemsAgainstReceiptTotal` reports a mismatch or `totalBelowSubtotal` |
| `no-over-claimed-items` | **warn** — `result.itemsNeedingReview` is non-empty |
| `all-items-claimed` | **fail** — some item still has unclaimed quantity (no claim entry, `shared` with nobody, or individual claims summing below `item.quantity`), so participant shares fall short of `totalBill` (only emitted when `itemClaims` is passed) |

`fail` means the numbers genuinely don't reconcile; `warn` means the split still adds up but something upstream is worth a second look. Rendered as a pass/warn/fail list under a **Checks** heading in `Settlement.tsx`.

### `src/bill/reconciliation.ts`

`checkItemsAgainstReceiptTotal(items, subtotal?, total?, receiptDiscount = 0)`

Used by `ReceiptReview.tsx` to answer "does the total add up?" live, as the user edits. Compares `sum(item.totalPrice)` against the receipt's subtotal (preferred) or total (fallback) — comparing against subtotal alone is sufficient to also cover tax, since `settlement.ts` derives tax from `(total + receiptDiscount) - subtotal`, so `items + tax ≈ total (+ discount)` reduces to `items ≈ subtotal`. Returns `'match' | 'mismatch' | 'insufficient_data'`; a mismatch is surfaced as a visible warning in Review, never used to silently alter item or receipt values.

Also returns `totalBelowSubtotal: boolean` — true whenever both subtotal and total are known and `total + receiptDiscount` is less than subtotal (adding the receipt discount back so a total that is legitimately below subtotal *because* of a printed discount is not flagged). This is a directional plausibility check independent of the match/mismatch status above: a payable total can never be lower than the pre-tax subtotal it was built from, so this fires even when the items-vs-subtotal comparison would otherwise stay quiet, and is rendered as its own, separately-worded warning in `ReceiptReview.tsx`. It is also folded into the `items-match-receipt` check on the Settlement screen (see `src/bill/review.ts`).

## 9. Detailed Data Flow

### Creating a Party

```mermaid
sequenceDiagram
  participant U as User
  participant P as PartyPage
  participant A as AuthContext
  participant G as Google Sheets API
  participant C as AppContext
  participant PC as PartyContext

  U->>P: Choose empty Sheet in Google Picker
  P->>P: receive selected spreadsheet ID
  P->>A: getAccessToken()
  A-->>P: access token
  P->>G: initializeParty(token, spreadsheetId)
  G-->>P: Sheet tabs and headers created
  P->>G: loadParty(token, spreadsheetId)
  G-->>P: BillState
  P->>C: restoreState(party.state)
  P->>PC: setParty({ ...party, role: 'owner' })
  P->>U: Navigate to upload
```

### Joining a Party

```mermaid
sequenceDiagram
  participant U as User
  participant P as PartyPage
  participant A as AuthContext
  participant G as Google Sheets API
  participant C as AppContext
  participant PC as PartyContext

  U->>P: Choose shared Sheet in Google Picker
  P->>P: receive selected spreadsheet ID
  P->>A: getAccessToken()
  A-->>P: access token
  P->>G: loadParty(token, spreadsheetId)
  G-->>P: Existing BillState
  P->>C: restoreState(party.state)
  P->>PC: setParty({ ...party, role: 'participant' })
  P->>U: Navigate to review (not upload)
```

### Editing and Autosaving

```mermaid
sequenceDiagram
  participant UI as UI Component
  participant C as AppContext
  participant S as PartySync
  participant A as AuthContext
  participant G as Google Sheets API

  UI->>C: updateBillItem / setBillItems / updateItemClaim / addParticipant
  C-->>S: state changes
  S->>S: debounce 250ms
  S->>A: getAccessToken()
  A-->>S: access token
  S->>G: syncParty(token, state)
  G-->>S: rows updated/appended
```

## 10. Receipt Processing Flow

```mermaid
flowchart TD
  File[Receipt image file] --> Decode[Decode]
  Decode --> Detect[detectReceiptRegion on the COLOR image]
  Detect --> Crop[Crop above confidence threshold, else use full image]
  Crop --> Prep[Grayscale + contrast, upscale small crops]
  Prep --> Tesseract[realReceiptOCR.extract]
  Tesseract --> OCRResult[OCRResult: text + tokens with bounding boxes]
  OCRResult --> Lines[detectLines: reconstruct visual rows]
  Lines --> Columns[detectAmountColumn: find the dominant amount column]
  Columns --> Classify[classifyLine per row: item / subtotal / tax / total / footer / ...]
  Classify --> Items[Item-block construction: pendingLines + anchor -> resolveQuantityAndRate]
  Classify --> Summary[Subtotal / tax / charges / adjustments / total candidates]
  Items --> ParsedBill[ParsedBill: minor-unit items + totals + reconciliation]
  Summary --> ParsedBill
  ParsedBill --> Legacy[toLegacyReceipt: minor -> major units]
  Legacy --> AppState[setBillItems]
  AppState --> Review[ReceiptReview: editable items + editable subtotal/total + live mismatch check]
```

OCR is currently powered by `tesseract.js`, even though the original product spec mentions PaddleOCR.js / ONNX Runtime Web. Everything upstream of Tesseract (decode, region detection, crop, resize, contrast) and everything downstream of it (line/column reconstruction, classification, item parsing, reconciliation) is deterministic, non-ML code, per the spec's constraint against LLMs/VLMs/cloud OCR.

A parallel Node-only path (`src/tests/receipt/support/`) drives this exact same pipeline — same decode-independent resize/crop/preprocess code, same Tesseract settings — so the four real receipt photos in `src/data/` can be captured and scored offline as a regression suite (see §14).

## 11. Calculation Rules

For each item:

- If claim mode is `shared`, the item total is split evenly among selected participants.
- If claim mode is `individual`, each participant pays `claimedQuantity * unitPrice`.
- The receipt discount (`receiptDiscount`, printed on the bill and baked into the receipt total) is resolved to a rupee amount and **added back** to the total first: `grossTotal = receiptTotal + receiptDiscount`.
- If `grossTotal` is greater than receipt subtotal, the difference is treated as tax/extra charge.
- Tax is allocated proportionally based on pre-tax participant shares.

Discounts (`receiptDiscount` and the group `discount`, both `BillDiscount`):

- Each is resolved to a rupee amount: `percent` is taken off the receipt subtotal (falling back to the item subtotal, and clamped to 100%); `amount` is used as-is.
- The receipt discount comes off first; the group discount is then capped at what participants still owe (base + tax − receipt discount), so `totalBill` can never go below 0.
- The **combined** pool is split by the **same pre-tax item-share ratios as tax** and subtracted from each participant's share. The rounding remainder lands on the last participant, so shares still sum exactly to `totalBill = grossTotal - (receiptDiscount + groupDiscount)` = `receiptTotal - groupDiscount`.

Example (receipt with its own printed discount, plus tax):

```text
Item subtotal:   INR 600
Receipt discount: -INR 60      (printed on the bill)
Tax:             +INR 90
Receipt total:    INR 630      -> grossTotal = 630 + 60 = 690 -> Tax/extra: INR 90

Base item shares:   A 260   B 260   C 80
Tax shares (x/600 x 90):        A 39    B 39    C 12
Discount shares (x/600 x 60):   A 26    B 26    C 8

Final shares:  A 273   B 273   C 84
Total bill: INR 630   (= printed grand total = sum of final shares)
```

### How the Settlement Summary card presents this

The engine numbers above are re-presented on the Settlement screen as a
receipt-style running tally. This is **display-only** — `Settlement.tsx` reads
`BillCalculationResult` and never feeds anything back:

- **Tax row** is derived as `total − subtotal` (`calculationResult.total` is the
  receipt grand total), *not* `BillCalculationResult.tax`. So the card shows the
  example above as `Tax +INR 30`, not `INR 90` — the receipt-discount add-back
  (`grossTotal = receiptTotal + receiptDiscount`) that the engine needs for
  proportional allocation is not shown to the user as tax. A receipt where the
  add-back would drive this negative (a pre-tax printed discount between a
  pre-discount subtotal line and the total) instead gets an explicit
  `Receipt discount −INR x` row sized so the column still foots.
- **Receipt discount** (when it did not get its own row) is noted under the grid
  as "Receipt total already includes a ₹x discount" rather than as a tally line,
  since it is already inside `total`.
- **Group discount** shows as its own `Discount −INR x` row beneath a `Bill total`
  (= `total`) line.
- The bold final line is **"Amount paid"** (= `totalBill`) when a group discount
  applied, otherwise **"Total bill"**. It always equals the sum of the
  participant shares shown below it.

So the card's Tax figure can legitimately differ from `BillCalculationResult.tax`
by the receipt-discount amount — that divergence is intentional.

## 12. Persistence Behavior

Remote persistence is done through `PartySync` and `syncParty`.

What is saved:

- Participants
- Receipt items
- Item claims
- Group discount (`META.discount_type` / `discount_value`)
- Receipt subtotal and grand total (`META.receipt_subtotal` / `receipt_total`)
- Receipt discount (`META.receipt_discount_type` / `receipt_discount_value`)

What is loaded:

- Participants
- Receipt items
- Item claims
- Group discount
- Receipt subtotal and grand total
- Receipt discount

Current important limitation:

- `syncRows` updates and appends rows, but it does not currently delete stale remote rows when local items, participants, or claims are removed.
- `settlements` are not calculated yet; participant shares are calculated.

## 13. Development Commands

From the project root:

```bash
npm run dev            # Vite dev server
npm run build          # tsc + production build
npm test               # vitest run — all unit/integration tests, once (not watch mode)
npm run test:watch     # vitest in watch mode
npm run test:receipts  # accuracy suites against the four real, committed receipt photos
CAPTURE_OCR=1 npm run test:capture   # regenerate the committed OCR fixtures (offline, deterministic)
```

Because this workspace is used from WSL, run these commands inside WSL from the Linux-mounted project path when possible:

```bash
cd /mnt/c/Projects/SnapSplit
npm run dev
```

Required Google Cloud configuration:

```text
GOOGLE_CLIENT_ID: hardcoded public browser OAuth client ID in src/google/auth.ts
GOOGLE_PICKER_API_KEY: restricted browser API key in src/google/auth.ts
GOOGLE_PROJECT_NUMBER: Cloud project number used as Picker app ID
```

## 14. Testing Overview

The project uses Vitest, run once (`vitest run`) rather than watch mode by default. Bill/claims logic:

- `src/tests/parser.test.ts` — legacy adapter, including a real captured OCR fixture
- `src/tests/claims.test.ts`, `src/tests/splitting.test.ts` — the latter also covers `distributeProportionally` (weighted split, remainder on the last id, empty-map edge cases)
- `src/tests/settlement.test.ts` — including an over-claimed-then-quantity-reduced scenario asserting `sum(participantSummaries.share) === item.totalPrice` and that `itemsNeedingReview` names the affected item, without the stored claim itself ever changing; group discount cases (flat and percentage allocation, clamp to amount owed with no negative shares, rounding-remainder sum invariant, no-op when unset); and receipt discount cases (added back before tax so `totalBill` = printed grand total, percentage resolution, stacking with a group discount, percentage clamped to 100)
- `src/tests/review.test.ts` — one case per `runReviewChecks` check: clean bill all-pass, shares-don't-sum fail, negative-share fail, no-participants fail, discount-capped warn / applied-in-full pass / omitted-when-unset, items-vs-receipt mismatch warn, over-claimed warn, plus receipt-discount checks (no false `totalBelowSubtotal` when the gap is the receipt discount, `receipt-discount-in-full` warn when capped, omitted when unset)
- `src/tests/reconciliation.test.ts` — `checkItemsAgainstReceiptTotal` synthetic cases, `totalBelowSubtotal` cases, and an integration suite running the real parser end-to-end (`toLegacyReceipt(parseReceipt(...))`) against all four real captured receipts

Receipt pipeline (`src/tests/receipt/`):

- `parsing/` — `numberParser`, `sectionClassifier`, and `receiptParser` edge cases: the rate/quantity collision, cross-validated decimal-drop recovery, prefix-leakage prevention, quantity/rate/total split across separate lines, and the conservative "never pull a number out of a name line" boundary.
- `layout/` — line reconstruction and numeric column detection against synthetic token geometry.
- `image/` — region detection against synthetic `RgbaImage` fixtures (bright rectangle vs. colored/noisy background).
- `fixtures/realReceiptFixtures.ts` — manually verified expected values for the four real photos in `src/data/`.
- `fixtures/ocr/*.ocr.json` — **committed**, captured `OCRResult` payloads (text + token bounding boxes) for those same four photos, produced by running the real image + OCR pipeline in Node. See the README next to them: regenerating these is a deliberate act, gated behind `CAPTURE_OCR=1`, because auto-regenerating on every run would let a parser regression hide behind freshly captured input.
- `support/` — the Node-only harness that makes this possible: `nodeImage.ts`/`nodeOcr.ts` (WASM/pure-JS decode + Tesseract, offline, using the repo's own committed `eng.traineddata`), `score.ts` (scores OCR text against a fixture's expected names/amounts), `thresholds.ts` (accuracy floors that ratchet up, never down without a documented reason). None of this is imported by application code — it exists only under `src/tests/`, confirmed to never leak into the Vite bundle.
  - **Accuracy numbers were recalibrated once** (see thresholds.ts's own comments): `nodeImage.ts` originally decoded JPEGs with `jpeg-js`, a pure-JS reference decoder that turned out to produce measurably different pixels than a browser's own `createImageBitmap`+canvas decode — confirmed by a literal OCR-text mismatch against a real browser session for the identical file. Now decoded with `@jsquash/jpeg` (a WASM mozjpeg build), after which Node's captured output matched the browser's exactly. The honest, corrected aggregate score is **75.7%** (previously reported as 86.1%/84.4% at different points — those numbers were real measurements, just of a decoder nobody's browser used). Every `OCR_QUALITY_FLOOR`/`PARSED_ITEM_COUNT` entry and every `realTokenParse.test.ts` field-level assertion was re-verified against the corrected fixtures, not just re-lowered to make the suite pass.
- `integration/` — `receiptPipeline.test.ts` (parses the four fixtures' hand-verified text), `realTokenParse.test.ts` (parses the four fixtures' *real captured tokens* — the test that reflects what the app actually does end to end; asserts exact name/quantity/unitPrice/totalPrice for every item the pipeline currently gets right, e.g. all 4 items on `example_bill.webp`, `subtotal.source === 'ocr'` on `sample_bill.jpg` as a regression test for the `%`-recovery fix, the recovered BLACK COFFEE row on `test_bill-1.jpeg` with MASALA DOSA documented as an accepted gap, and 3 of 5 correct item totals on `test_bill-2.jpeg` confirmed against a live browser session), `ocrQuality.test.ts` (scores OCR text quality with recorded floors), `captureOcrFixtures.test.ts` (the `CAPTURE_OCR=1`-gated regeneration job). `ocrTuning.test.ts`, `debugLines.test.ts`, `cropProbe.test.ts`, `illuminationSweep.test.ts`, and `illuminationVariance.test.ts` are exploratory dev tooling for manually sweeping preprocessing settings, inspecting line reconstruction, or evaluating illumination-correction configurations/gating signals — gated behind their own env vars, not part of a normal `npm test` run.

Recommended future test additions:

- Google Picker flow tests with mocked Picker and OAuth APIs.
- `loadParty` Sheet row conversion tests.
- `syncParty` row generation tests.
- Party create/join UI tests with mocked Google APIs.
- Persistence tests for subtotal/total once the Sheet schema stores those values.

## 15. Known Gaps and Next Engineering Targets

These are not bugs in this document; they are the current implementation boundaries worth knowing:

- No SnapSplit backend or database.
- No local `.xlsx` file loading.
- No automatic Google Sheet creation.
- No Drive permission management.
- No realtime multi-user conflict handling.
- No stale-row deletion in Google Sheets sync.
- No settlement transfer optimization yet.
- OCR implementation uses Tesseract, while the product spec references PaddleOCR.js.
- Perspective correction (`image/perspective.ts`) is unused — nothing in the pipeline detects a receipt quadrilateral to feed it, so a skewed photo is never rectified before OCR.
- `public/eng.traineddata.gz` is a generated artifact (gzip of the repo-root `eng.traineddata`), not auto-regenerated — if the root file is ever updated, the gzip copy must be regenerated by hand or the browser and the Node test harness silently diverge again (see §8, `src/receipt/ocr.ts`).
- Illumination/shadow correction (`image/illumination.ts`) is implemented and empirically tested but disabled by default. Re-swept after fixing the JPEG-decoder divergence (see §14): the *aggregate text-similarity score* looked like a clean win (73.2% → 84.4%), but checking actual parsed items showed it trades one set of problems for a worse one — a real item corrupted to an invented total on `sample_bill.jpg`, items wrongly merging on `test_bill-2.jpeg`, and GST/Round Off summary lines misread as fake phantom items. A higher text-similarity score is not the same thing as a trustworthy item list. A locally-shadowed receipt (`test_bill-2.jpeg`'s middle-right band) still loses some items to OCR corruption that no parser-side fix has yet recovered without introducing a worse failure elsewhere.
- ~~Known, unfixed risk on `test_bill-1.jpeg`: a phantom ₹15,000 item from a garbled summary/footer line.~~ **Fixed**: `parseItem`'s `MAX_PLAUSIBLE_ITEM_QUANTITY` guard (see §8) rejects any row whose resolved quantity exceeds 50 — the row's internal consistency (`quantity × rate == total`) was exactly what made it look trustworthy, so an implausible quantity is now treated as proof the whole row isn't a genuine item.
- ~~Whole-number currency amounts displayed without their decimal places (e.g. a ₹250.00 item showing as "250") in `ReceiptReview.tsx` and `ItemClaim.tsx`, since several `<td>{value}</td>`-style displays rendered raw JS numbers instead of `value.toFixed(2)`.~~ **Fixed**: every currency display across Review and Item Claims now formats with `.toFixed(2)`, matching the convention `Settlement.tsx` already used. This was a display bug, not an OCR or parsing issue — the underlying stored values were always correct.
- Component-level UI tests (e.g. for the owner/participant Upload-link gating in `App.tsx`) are not present: this repo has no jsdom/happy-dom test environment configured, and adding one just for a single assertion was judged not worth introducing a first-of-its-kind RTL setup. That behavior is currently verified manually via `npm run dev` instead, consistent with how the rest of the UI is checked.
- A dropped/hallucinated decimal point on a printed total is only detectable when a row has an independently-read rate to cross-validate against (3+ numeric values). A 2-value row (quantity + total only, no separate rate) has no second number to check it against, so this class of OCR error is only caught, if at all, by the bill-level items-vs-subtotal mismatch check in Review, not row-locally.
- The OCR pipeline's own `ParsedBill.reconciliation` (whether the receipt's *printed* summary section is internally consistent) is computed but not surfaced in the UI — only the live items-vs-subtotal/total check added to Review (`checkItemsAgainstReceiptTotal`, recomputed as the user edits) is currently shown to the user.
- If a receipt's total is genuinely never known (only subtotal, or neither), `calculateBillResults` derives tax as `grossTotal - subtotal` (`grossTotal = receiptTotal + receiptDiscount`), which silently becomes `0` rather than "unknown" in that case — pre-existing behavior, more likely to surface now that totals are directly editable in Review. Subtotal / total / receipt discount are now persisted to `META`, so a value entered by one participant carries to anyone who later loads the party.
- Two discount fields exist and must not be confused: **Discount** is a reduction the group applies on top of the receipt (`totalBill = grossTotal - discount`); **Receipt discount** transcribes a discount already printed on the bill and is added back into `grossTotal` before tax is derived so `total - subtotal` doesn't go negative. Putting a printed receipt discount into the group Discount field would still under-derive tax and mis-total; use Receipt discount for that. Note the Settlement Summary card sidesteps the engine's add-back for *display*: it derives its Tax row as `total − subtotal`, so the card's Tax can read lower than `BillCalculationResult.tax` by the receipt-discount amount (see §11, "How the Settlement Summary card presents this").
- Google sign-in now always shows the account chooser (`prompt: 'select_account'`), but the resulting token is cached for the lifetime of the page load (`AuthContext`) — there's no "switch account" affordance short of a full reload or `signOut()` (which itself isn't wired into any UI yet).

The most valuable next hardening work would be to add stale-row deletion, add tests for the Google Sheet adapter, and wire quadrilateral detection into the image pipeline so perspective correction stops being dead code.

## 16. UI Theme, Branding, and Responsive Layout

The entire UI is styled by one hand-written stylesheet, [src/styles.css](../src/styles.css) (imported once in `main.tsx`). There is no CSS framework, no CSS-in-JS, and no build-time style tooling beyond Vite's default CSS handling. Components carry only semantic class names (`.card`, `.receipt-table`, `.item-claim-card`, …); all visual decisions live in the stylesheet.

### Design tokens and theming

`styles.css` opens with a `:root` block of CSS custom properties — colour roles (`--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--border`, `--accent`, `--accent-hover`, `--accent-contrast`, `--danger`, `--danger-bg`), elevation (`--shadow-sm`, `--shadow-md`), radii (`--radius-sm`/`--radius`/`--radius-lg`), `--maxw`, and the `--font` stack. Every rule below references tokens rather than literal colours.

Dark mode is a single `@media (prefers-color-scheme: dark)` block that re-defines the same colour/shadow tokens. There is **no toggle and no persisted preference** — the app follows the OS/browser setting. Because components only ever reference tokens, nothing else in the stylesheet is theme-aware. `index.html` carries matching `<meta name="theme-color">` entries for light/dark so mobile browser chrome tracks the theme.

The palette is a warm near-neutral (off-white `#fafaf8` / warm-charcoal `#131311` grounds) with a single teal accent (`#0f766e` light, brightened to `#2dd4bf` in dark for contrast). Accent is used only for primary actions, links, active nav, and the logo.

### Branding

- [src/components/Logo.tsx](../src/components/Logo.tsx) — a stateless inline-SVG mark (a receipt with a diagonal cut through it). It draws its outline and text lines in `currentColor`, so the header simply sets `color: var(--accent)` on it and it re-tints automatically in dark mode. The diagonal "cut" is stroked in `var(--bg)` so it reads as a gap punched through the mark against whatever sits behind it. Takes a single `size` prop (px, default 24); `aria-hidden` since the adjacent wordmark carries the name.
- [public/favicon.svg](../public/favicon.svg) — the same motif as a standalone favicon, with its own `<style>` block (including a nested `prefers-color-scheme: dark` rule) since a favicon has no access to the page's tokens. Referenced from `index.html` as `rel="icon" type="image/svg+xml"`.
- The header wordmark is "Snap" in `--text` + "Split" in `--accent` (`.wordmark span`), tracked tight.

### Responsive / mobile behaviour

The app is expected to be usable on Chrome Android and iOS Safari at ~375px width. Concrete measures in `styles.css`:

- Global `* { box-sizing: border-box }` and full-width form controls, so 100%-width inputs never overflow their container.
- `.app-shell` padding is `clamp(16px, 4vw, 32px)`.
- Wide tables (`ReceiptReview` has five columns of editable fields) are never allowed to widen the page: every `.receipt-table` sits inside `.card`, and `.card` has `overflow-x: auto` (+ `-webkit-overflow-scrolling: touch`) so the table scrolls within its card.
- Below `640px`: the header stacks, the nav becomes a single horizontal scroll strip, `.item-header` and `.participant-add` stack, nav links and buttons get larger tap targets, and `.section-actions` buttons go full-width.
- Form controls are pinned to `font-size: 16px` — under 16px, iOS Safari zooms the viewport on focus, which the smaller `.receipt-totals` label context would otherwise trigger.
- `:focus-visible` gets an explicit accent outline on inputs, buttons, and links.

Previously unstyled component class names (`.item-claim-card`, `.item-header`, `.claim-mode-toggle`, `.shared-split`, `.participant-checkboxes`, block-level `.field-error`) now all have rules; the shared-participant checkboxes render as pill chips.

### What is not done

- No visual regression / screenshot tests; the UI is still verified manually via `npm run dev` (consistent with §14, §15).
- No dark-mode toggle — OS-driven only.
- The active nav link does not auto-scroll into view within the mobile nav strip.
- Google Picker / OAuth popup UI is Google's own and is not themed by SnapSplit.
