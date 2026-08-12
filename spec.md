# SnapSplit — V1 Product & Technical Specification

**Status:** Development Specification
**Platform:** Mobile-first web application
**Stack:** React + TypeScript
**Architecture:** Backendless / client-side
**Persistence & collaboration:** Google Sheets + Google APIs
**OCR:** PaddleOCR.js / ONNX Runtime Web
**Initial scope:** One-time bill splitting, one payer

---

# 1. Product Overview

SnapSplit makes splitting a restaurant bill from a photograph easy.

The user takes a photo of a receipt, SnapSplit extracts the bill, the owner verifies it, participants claim what they consumed, and SnapSplit calculates everyone's share.

The final breakdown is written to a Google Sheet that can be shared with the participants.

The core V1 flow is:

```text
Receipt Photo
      ↓
On-device OCR
      ↓
Receipt Parser
      ↓
Bill Data
      ↓
Validation / User Correction
      ↓
Add Participants
      ↓
Claim Items
      ↓
Calculate Shares
      ↓
Google Sheet
      ↓
Share with Participants
```

SnapSplit is **not a Splitwise replacement in V1**.

There is no bill history, social graph, friend system, recurring groups, or long-term account state.

A bill represents a **single one-time outing**.

---

# 2. Core V1 Assumptions

The following constraints deliberately keep V1 small:

### Payment

* Exactly one person pays the entire bill.
* The bill owner is the payer.
* Multiple payers are out of scope.

### Item quantities

* Quantities are positive integers.
* Claims are integers.
* Fractional quantities are not supported.

For example:

```text
Tofu Biryani × 2 = ₹360
```

means:

```text
2 units
₹180 / unit
₹360 total
```

A participant can claim `0`, `1`, or `2` units.

### Shared items

An item can either:

1. Be individually claimed by quantity, or
2. Be split equally among selected participants.

### Collaboration

* A bill is shared using Google APIs.
* Each participant signs in independently with Google.
* There is no shared SnapSplit session.
* Google identity provides authentication.
* Google Drive/Sheets permissions provide access control.

### Persistence

Google Sheets is the shared persistence layer.

There is no:

* SnapSplit backend
* PostgreSQL
* custom database
* user database
* Party history database

---

# 3. Architecture

```text
                         PHONE / BROWSER
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  React UI                                                   │
│      │                                                      │
│      ├── Google OAuth                                       │
│      │                                                      │
│      ├── Receipt Image                                      │
│      │       ↓                                              │
│      │   OCR Engine                                         │
│      │       ↓                                              │
│      │   Receipt Parser                                     │
│      │       ↓                                              │
│      │   Validation                                          │
│      │                                                      │
│      ├── Participants                                       │
│      │       ↓                                              │
│      ├── Claims UI                                          │
│      │       ↓                                              │
│      │   Splitting Engine                                   │
│      │       ↓                                              │
│      │   BillSplitResult                                    │
│      │                                                      │
│      └── Google Sheets API                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Technology

* React
* TypeScript
* Google OAuth
* Google Sheets API
* Google Drive API
* PaddleOCR.js
* ONNX Runtime Web
* WebGPU when available
* WASM/CPU fallback

The application should perform receipt processing and calculations directly in the browser.

---

# 4. Development Tracks

Development is divided into seven independent tracks.

| Track | Responsibility                        | Main Output                            |
| ----- | ------------------------------------- | -------------------------------------- |
| **A** | Photo → OCR → Bill Data               | `Bill`                                 |
| **B** | Bill Data → Validation                | `ValidatedBill`                        |
| **C** | Bill UI + Participants                | React UI                               |
| **D** | Claims Model + Validation             | `BillClaims`                           |
| **E** | Splitting / Calculation               | `BillSplitResult`                      |
| **F** | Google OAuth + One-Time Collaboration | Google authentication, sharing, access |
| **G** | Google Sheet Generation               | Formatted spreadsheet                  |

Tracks should use mock data where necessary so that development can happen in parallel.

---

# 5. Track A — Photo → OCR → Bill Data

## Objective

Convert a receipt image into structured bill data.

```text
Photo
 ↓
Image preprocessing
 ↓
OCR
 ↓
OCR tokens + bounding boxes
 ↓
Receipt parser
 ↓
Bill
```

## Image Acquisition

Support:

* taking a photo using the phone camera
* uploading an existing receipt image

Receipt images must remain client-side.

Do not upload receipt images to an application server.

## OCR abstraction

The rest of the application must not depend on PaddleOCR-specific structures.

```ts
interface ReceiptOCR {
  extract(image: ImageData): Promise<OCRResult>;
}
```

```ts
type OCRToken = {
  text: string;
  confidence?: number;
  boundingBox: BoundingBox;
};

type OCRResult = {
  tokens: OCRToken[];
};
```

## OCR implementation

Initial implementation:

```text
PaddleOCR.js
      ↓
ONNX Runtime Web
      ↓
WebGPU
      ↓
WASM / CPU fallback
```

Track:

* OCR accuracy
* inference time
* model initialization time
* browser compatibility
* memory usage

## Receipt parser

The parser uses:

* OCR text
* bounding-box positions
* spatial relationships
* numeric patterns
* receipt layout heuristics

It must not assume every receipt has the same column layout.

Example:

```text
Tofu Biryani     2     360
Masala Dosa      1     180
Chana Chaat      1     240
Lime Soda        2     160
```

should become:

```ts
{
  items: [
    {
      id: "...",
      name: "Tofu Biryani",
      quantity: 2,
      unitPrice: 180,
      totalPrice: 360
    },
    ...
  ]
}
```

The parser must remain replaceable so a future ML/document-understanding model can be added without redesigning the rest of the application.

---

# 6. Track B — Bill Data → Validation

## Objective

Never assume OCR is correct.

Convert parsed bill data into a user-confirmed `ValidatedBill`.

```text
OCR
 ↓
Parsed Bill
 ↓
Validation
 ↓
User correction
 ↓
Confirmation
 ↓
ValidatedBill
```

## Validation rules

### Item-level

```text
name != empty
quantity > 0
quantity is integer
unitPrice >= 0
totalPrice >= 0
```

### Mathematical

For each item:

```text
quantity × unitPrice ≈ totalPrice
```

Use integer minor currency units internally rather than floating-point money.

Example:

```ts
36000 // ₹360.00
```

### Bill-level

Where applicable:

```text
sum(item totals)
+ tax
+ service charge
- discount
≈ final total
```

Discrepancies should be shown to the user.

Do not silently modify values to make totals match.

## Editable validation UI

The owner must be able to:

* edit item names
* edit quantities
* edit prices
* add items
* remove items
* edit tax
* edit service charge
* edit discount
* correct the final total

The owner explicitly confirms the bill before participants can claim anything.

---

# 7. Track C — Bill UI + Participants

## Objective

Build the primary mobile user experience.

The UI should be designed around a phone-sized screen and simple interaction.

## Screens

```text
1. Receipt Upload
2. Bill Review
3. Participants
4. Item Claims
5. Final Split
6. Sharing / Completion
```

## Participants

```ts
type Participant = {
  id: string;
  name: string;
  email?: string;
};
```

The owner is automatically included.

The owner is also the payer in V1.

Example:

```text
Who is splitting this bill?

Karthik
Rahul
Amit
```

The UI should eventually collect participant Google email addresses where required for Google Sheet sharing.

---

# 8. Track D — Claims Model + Validation

## Individual claim mode

Example:

```text
Tofu Biryani × 2
₹360

Karthik   [-] 1 [+]
Rahul     [-] 1 [+]
Amit      [-] 0 [+]

Remaining: 0
```

Invariant:

```ts
sum(claimed quantities) <= item.quantity
```

If an item has quantity `2`, this must be rejected:

```text
Karthik = 1
Rahul   = 1
Amit    = 1
```

## Shared mode

Example:

```text
Chana Chaat
₹240

○ Individual claims
● Split among people

☑ Karthik
☑ Rahul
☑ Amit

₹80 each
```

The item is divided equally among the selected participants.

## Claim model

```ts
type IndividualClaim = {
  mode: "individual";
  claims: Record<string, number>;
};

type SharedClaim = {
  mode: "shared";
  participantIds: string[];
};

type ItemClaim = {
  itemId: string;
  claim: IndividualClaim | SharedClaim;
};

type BillClaims = {
  participants: Participant[];
  items: ItemClaim[];
};
```

Claims logic must be independent of React.

---

# 9. Track E — Splitting / Calculation Engine

This is pure TypeScript business logic.

It must not depend on:

* React
* browser APIs
* Google APIs
* OCR

It should be independently unit tested.

## Input

```text
ValidatedBill
+
Participants
+
BillClaims
+
Payer
```

## Output

```ts
BillSplitResult
```

## Individual items

Example:

```text
Tofu Biryani × 2
Total = ₹360
```

Unit price:

```text
₹180
```

Claims:

```text
Karthik = 1
Rahul = 1
```

Result:

```text
Karthik → ₹180
Rahul   → ₹180
```

## Shared items

```text
Chana Chaat = ₹240

Karthik
Rahul
Amit
```

Result:

```text
Karthik → ₹80
Rahul   → ₹80
Amit    → ₹80
```

## Tax and charges

Initially allocate proportionally:

```text
participant tax =
participant subtotal / bill subtotal × total tax
```

Keep tax allocation separate from item claiming so the allocation strategy can be changed later.

## Rounding

All money calculations should use integer minor units.

Rounding rules must be deterministic.

---

# 10. Single-Payer Calculation

V1 supports exactly one payer.

Example:

```text
Bill total = ₹940

Karthik paid ₹940
```

Participant shares:

```text
Karthik = ₹520
Rahul   = ₹340
Amit    = ₹80
```

Net balances:

```text
Karthik = +₹420
Rahul   = -₹340
Amit    =  -₹80
```

The application should display these balances.

A generalized settlement optimization algorithm is **out of scope for V1**.

---

# 11. Track F — Google OAuth + One-Time Collaboration

This track handles how multiple independent users collaborate without a SnapSplit backend.

## Core principle

We do not share SnapSplit sessions.

Each user has their own Google-authenticated browser session.

The Google Sheet represents the shared bill state.

```text
Google OAuth
     ↓
User identity

Google Drive permissions
     ↓
Access to bill Sheet

Google Sheets
     ↓
Shared bill state
```

## Owner flow

```text
Owner signs in with Google
        ↓
Creates bill
        ↓
Confirms bill
        ↓
Create Google Spreadsheet
        ↓
Write bill data
        ↓
Add participants
        ↓
Grant Google Sheet access
        ↓
Generate invitation mechanism
```

## Participant flow

```text
Participant receives invitation
        ↓
Opens SnapSplit
        ↓
Signs in with Google
        ↓
Google identity established
        ↓
Verify access to bill Sheet
        ↓
Load bill
        ↓
Make claims
        ↓
Write claims
```

## Google APIs

Use:

* Google OAuth for authentication
* Google Drive API for permissions/sharing
* Google Sheets API for reading/writing bill state

No custom authentication system.

No SnapSplit user database.

---

# 12. One-Time Collaboration Model

SnapSplit does not maintain a list of:

* previous parties
* friends
* groups
* bills
* user history

The owner creates a bill for a single outing.

The participants collaborate on that bill and the associated Google Sheet.

After the split is complete, SnapSplit does not need to maintain a relationship between the users.

Conceptually:

```text
One outing
    │
    ▼
One SnapSplit bill
    │
    ▼
One Google Sheet
    │
    ├── Owner
    ├── Participant 1
    ├── Participant 2
    └── Participant 3
```

---

# 13. Invitation / Party Link

The desired UX is:

```text
Owner
 ↓
Create bill
 ↓
Add participants
 ↓
Share invitation
 ↓
Participants open SnapSplit
 ↓
Sign in with Google
 ↓
Enter bill
```

A SnapSplit invitation should provide an entry point to the specific bill.

Example:

```text
https://snapsplit.app/party/<identifier>
```

### Important architectural issue

Because there is no backend, SnapSplit cannot maintain a server-side mapping such as:

```text
party-token → spreadsheet ID
```

Therefore the exact mechanism for resolving an invitation URL to the Google Sheet must be designed as part of Track F.

The implementation should avoid introducing a backend merely to solve this mapping problem.

Potential designs should be evaluated before implementation.

---

# 14. Google Sheet State

The Google Sheet should act as the persistent shared state for the bill.

It may contain structured sections such as:

```text
Party metadata

Participants

Bill

Claims

Calculated shares
```

The exact internal representation should be hidden behind a Sheets abstraction.

The UI and calculation engine should not directly manipulate spreadsheet cells.

---

# 15. Track G — Google Sheet Generation

Track F owns Google authentication, access and sharing.

Track G owns the actual spreadsheet contents and formatting.

## Main table

One row per bill item.

One column per participant.

Example:

| Item             |    Price |  Karthik |    Rahul |    Amit |
| ---------------- | -------: | -------: | -------: | ------: |
| Tofu Biryani × 2 |     ₹360 |     ₹180 |     ₹180 |      ₹0 |
| Masala Dosa      |     ₹180 |     ₹180 |       ₹0 |      ₹0 |
| Chana Chaat      |     ₹240 |      ₹80 |      ₹80 |     ₹80 |
| Lime Soda × 2    |     ₹160 |      ₹80 |      ₹80 |      ₹0 |
| **Total**        | **₹940** | **₹520** | **₹340** | **₹80** |

## Tax / charges

Example:

| Item      |    Price |  Karthik |    Rahul |    Amit |
| --------- | -------: | -------: | -------: | ------: |
| Subtotal  |     ₹940 |     ₹520 |     ₹340 |     ₹80 |
| GST       |      ₹47 |      ₹26 |      ₹17 |      ₹4 |
| **Total** | **₹987** | **₹546** | **₹357** | **₹84** |

## Payment summary

| Person  | Paid | Share |   Net |
| ------- | ---: | ----: | ----: |
| Karthik | ₹987 |  ₹546 | +₹441 |
| Rahul   |   ₹0 |  ₹357 | -₹357 |
| Amit    |   ₹0 |   ₹84 |  -₹84 |

The spreadsheet should be human-readable and useful after SnapSplit is no longer open.

---

# 16. Domain Models

These are the primary contracts between development tracks.

```ts
type Money = number; // integer minor units

type BillItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
};

type Bill = {
  id: string;
  currency: string;

  items: BillItem[];

  subtotal: Money;
  tax: Money;
  serviceCharge: Money;
  discount: Money;
  total: Money;
};

type Participant = {
  id: string;
  name: string;
  email?: string;
};

type IndividualClaim = {
  mode: "individual";
  claims: Record<string, number>;
};

type SharedClaim = {
  mode: "shared";
  participantIds: string[];
};

type ItemClaim = {
  itemId: string;
  claim: IndividualClaim | SharedClaim;
};

type BillClaims = {
  participants: Participant[];
  items: ItemClaim[];
};

type ParticipantShare = {
  participantId: string;
  subtotal: Money;
  tax: Money;
  charges: Money;
  total: Money;
};

type BillSplitResult = {
  itemShares: Record<string, Record<string, Money>>;
  participantShares: ParticipantShare[];
  payerId: string;
};
```

---

# 17. Critical Interfaces

The following contracts should be agreed upon before parallel development.

```text
OCR
 ↓
OCRResult
```

```text
Parser
 ↓
Bill
```

```text
Validation
 ↓
ValidatedBill
```

```text
Claims UI
 ↓
BillClaims
```

```text
Splitting Engine
 ↓
BillSplitResult
```

```text
BillSplitResult
 ↓
Google Sheet
```

Each implementation should remain replaceable behind these contracts.

---

# 18. Suggested Project Structure

```text
src/
│
├── app/
│
├── receipt/
│   ├── models.ts
│   ├── image.ts
│   ├── ocr.ts
│   ├── parser.ts
│   └── validation.ts
│
├── bill/
│   ├── models.ts
│   ├── claims.ts
│   ├── splitting.ts
│   └── settlement.ts
│
├── collaboration/
│   ├── auth.ts
│   ├── sharing.ts
│   ├── party.ts
│   └── access.ts
│
├── google/
│   ├── sheets.ts
│   ├── drive.ts
│   └── repository.ts
│
├── components/
│   ├── ReceiptUpload.tsx
│   ├── ReceiptReview.tsx
│   ├── Participants.tsx
│   ├── ItemClaim.tsx
│   ├── BillSummary.tsx
│   └── SheetExport.tsx
│
└── tests/
    ├── parser.test.ts
    ├── validation.test.ts
    ├── claims.test.ts
    ├── splitting.test.ts
    └── sheets.test.ts
```

---

# 19. Testing Requirements

## Receipt parsing

Test:

* normal receipts
* quantity + unit price + total
* different layouts
* missing quantity
* malformed prices
* multiple numeric columns

## Validation

Test:

```text
quantity = 2
unit price = ₹180
total = ₹360
→ valid
```

and:

```text
quantity = 2
unit price = ₹180
total = ₹400
→ discrepancy
```

## Claims

Test:

```text
quantity = 2
claims = [1, 1]
→ valid
```

```text
quantity = 2
claims = [1, 1, 1]
→ invalid
```

## Shared splitting

Test:

```text
₹300 / 3
→ ₹100 each
```

Also test uneven division and deterministic rounding.

## Calculation

Test:

* one participant
* multiple participants
* individual claims
* shared items
* mixed individual/shared items
* tax allocation
* rounding
* one payer

Important invariants:

```text
sum(participant shares) = bill total
```

and:

```text
sum(net balances) = 0
```

---

# 20. Development Strategy

## Phase 1 — Core vertical slice

Do not start with OCR.

Use hardcoded/mock bill data.

```text
Mock Bill
    ↓
Bill Review
    ↓
Participants
    ↓
Claims
    ↓
Splitting Engine
    ↓
Final Result
```

This establishes the core product flow.

---

## Phase 2 — Google collaboration

Implement:

```text
Google OAuth
      ↓
Create Google Sheet
      ↓
Write bill
      ↓
Share Sheet
      ↓
Participant authentication
      ↓
Participant access
      ↓
Read/write claims
```

At the end of this phase:

```text
Mock Bill
    ↓
Claims
    ↓
Split
    ↓
Shared Google Sheet
```

must work across multiple independent users.

---

## Phase 3 — Real OCR

Implement:

```text
Receipt Image
      ↓
PaddleOCR.js
      ↓
OCRResult
      ↓
Receipt Parser
      ↓
Bill
      ↓
Validation
```

Connect this to the existing claims/collaboration flow.

---

## Phase 4 — Real-world benchmarking

Test OCR and parsing against:

* real receipts
* public receipt datasets

Measure:

* OCR accuracy
* item extraction accuracy
* quantity extraction accuracy
* price extraction accuracy
* total extraction accuracy
* parser failure rate
* mobile inference performance

Only after observing actual failure modes should additional ML/document-understanding models be considered.

---

# 21. Dependency Graph

```text
                         ┌──────────────┐
                         │   TRACK A    │
                         │ OCR + Parser │
                         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │   TRACK B    │
                         │ Validation   │
                         └──────┬───────┘
                                │
                                ▼
                          ValidatedBill
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
       ┌────────────┐    ┌────────────┐    ┌─────────────┐
       │  TRACK C   │    │  TRACK D   │    │   TRACK F   │
       │    UI      │    │   Claims   │    │ Google Auth │
       │            │    │            │    │ + Sharing   │
       └─────┬──────┘    └──────┬─────┘    └──────┬──────┘
             │                  │                 │
             └────────┬─────────┘                 │
                      ▼                           │
                ┌────────────┐                    │
                │  TRACK E   │                    │
                │  Splitting │                    │
                └─────┬──────┘                    │
                      │                           │
                      └──────────────┬────────────┘
                                     ▼
                              ┌─────────────┐
                              │   TRACK G   │
                              │ Sheet Output│
                              └─────────────┘
```

Tracks A–G can largely be developed in parallel once the domain contracts are frozen.

---

# 22. V1 Acceptance Criteria

V1 is complete when:

1. A user can sign in with Google.
2. A user can take or upload a receipt photo.
3. The receipt is processed locally.
4. OCR produces structured receipt information.
5. The extracted bill can be manually corrected.
6. The owner can confirm the bill.
7. The owner can add participants.
8. The owner can identify the participants' Google accounts/emails for sharing.
9. A Google Sheet can be created for the bill.
10. Participants can be granted access to the Sheet through Google APIs.
11. A participant can enter the bill through the SnapSplit collaboration flow.
12. Each participant can sign in independently with Google.
13. Participants can claim integer quantities of individual items.
14. Shared items can be divided equally among selected participants.
15. The application prevents claims exceeding the available quantity.
16. Each participant's item-level shares are calculated.
17. Taxes/charges are allocated according to the V1 proportional strategy.
18. The owner is treated as the sole payer.
19. Each participant's final share is calculated.
20. Net balances are displayed.
21. The resulting breakdown is written to the Google Sheet.
22. The Sheet contains one row per item and one column per participant.
23. The Sheet contains participant totals and payment/net-balance information.
24. No SnapSplit backend or database is required.
25. No SnapSplit bill history is maintained.

---

# 23. Explicit Non-Goals

The following should not creep into V1:

```text
❌ Splitwise-style bill history
❌ Friends
❌ Groups
❌ Persistent user profiles
❌ Recurring expenses
❌ Multiple payers
❌ Optimized settlements
❌ UPI payments
❌ Chat
❌ Notifications
❌ Backend
❌ Database
❌ LLM receipt parsing
❌ Cloud OCR
❌ Fractional item quantities
```

The V1 product is deliberately narrow:

```text
              ONE OUTING
                  │
                  ▼
             ONE RECEIPT
                  │
                  ▼
              ONE PAYER
                  │
                  ▼
           MULTIPLE PEOPLE
                  │
                  ▼
        CLAIM / SHARE ITEMS
                  │
                  ▼
         CALCULATE EACH SHARE
                  │
                  ▼
          ONE SHARED SHEET
```

**Primary engineering goal:** get this complete one-time flow working reliably before adding sophistication.
