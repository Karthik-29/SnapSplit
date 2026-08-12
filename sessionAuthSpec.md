# SnapSplit — Backendless Google Sheets Party Sharing

## 1. Objective

Implement backendless party/session sharing for SnapSplit using **Google Sheets as the persistent shared state**.

The application must not introduce a SnapSplit backend, database, session server, or WebSocket server.

A Google Sheet is the authoritative state for a party. Any user who has access to that Sheet can open SnapSplit, provide the Sheet URL, reconstruct the party state locally, make changes, and persist those changes directly to the same Sheet through the Google Sheets API.

Assume that Google Sheet sharing/permissions are handled outside SnapSplit for this feature. The implementation should simply rely on the authenticated user's Google account having sufficient access to the supplied Sheet.

Existing SnapSplit functionality should be preserved. Implement only the pieces required to connect the existing bill/splitting functionality to a shared Google Sheet.

---

# 2. Core Architecture

The architecture should be:

```text
                    Google
                      │
             ┌────────┴─────────┐
             │                   │
        Google OAuth        Google Sheets API
             │                   │
             └────────┬──────────┘
                      │
                SnapSplit SPA
                      │
              local application state
```

There is no SnapSplit backend.

The Google Sheet acts as:

* party/session identifier
* persistent state
* shared state between participants
* synchronization mechanism

The Google Sheet URL supplied by the user is the entry point into a party.

Do not create a separate SnapSplit session ID/database mapping.

---

# 3. Authentication Requirement

Google authentication is required before either of these actions:

* Create Party
* Join Party

Unauthenticated users should therefore see the existing Google login flow before they can access party functionality.

After successful authentication, the application should retain the Google OAuth state/token according to the existing authentication implementation.

Do not introduce a custom username/password authentication system.

The Google OAuth **client ID is public configuration** and may be included in the frontend/repository or environment configuration. Do not introduce or expose an OAuth client secret in the frontend.

Use the existing OAuth implementation if one is already present. Extend it only with the scopes required for Google Sheets access.

Required capability:

```text
Read/write Google Sheets
```

Prefer the narrowest appropriate Google scope rather than requesting broad Drive access.

---

# 4. Application Entry Flow

After authentication, present two primary actions:

```text
Create Party
Join Party
```

Conceptually:

```text
             SnapSplit
                 │
          Google authenticated
                 │
          ┌──────┴──────┐
          │             │
       Create         Join
        Party          Party
          │             │
     Sheet URL      Sheet URL
          │             │
          └──────┬──────┘
                 │
          Load/initialize
             Sheet
                 │
             Party UI
```

The application should not automatically create a Google Sheet.

Instead, the user creates an empty Google Sheet through Google Sheets and supplies its URL.

This keeps the required Google permissions minimal and makes the Sheet explicitly controlled by the user.

---

# 5. Create Party Flow

## 5.1 User flow

The Create Party screen should instruct the user to:

1. Create an empty Google Sheet.
2. Configure sharing/permissions as desired.
3. Copy the Google Sheets URL.
4. Paste the URL into SnapSplit.
5. Submit.

Example UI:

```text
Create Party

Create an empty Google Sheet and make sure everyone
who needs to participate has access to it.

Paste the Google Sheets link:

[ https://docs.google.com/spreadsheets/d/... ]

[Start Party]
```

## 5.2 Sheet validation

After submission:

1. Extract the spreadsheet ID from the URL.
2. Validate that the URL represents a supported Google Sheets document.
3. Attempt to access the spreadsheet using the authenticated Google account.
4. If access fails, show a useful error explaining that the user does not have access.
5. If access succeeds, inspect the spreadsheet structure.

## 5.3 Initialize empty Sheet

If the supplied Sheet is empty/uninitialized, SnapSplit should initialize it with the application's schema.

The initialization should be deterministic and idempotent.

Calling initialization twice must not destroy existing data.

The implementation should first determine whether the Sheet is already a valid SnapSplit Sheet.

If it is not initialized and contains no meaningful data, initialize it.

If it contains unrelated user data, **do not overwrite it**. Show an error asking the user to provide an empty Sheet.

---

# 6. Join Party Flow

## 6.1 User flow

The Join Party screen should accept a Google Sheets URL:

```text
Join Party

Paste the Google Sheets link:

[ https://docs.google.com/spreadsheets/d/... ]

[Join Party]
```

The user must already be authenticated with Google.

## 6.2 Loading

When the user submits the URL:

1. Extract the spreadsheet ID.
2. Validate the URL.
3. Read the Sheet using the authenticated Google account.
4. Validate the SnapSplit schema/version.
5. Construct the local application state from the Sheet.
6. Navigate to the existing party/bill UI.

The URL itself is the party identifier.

There should be no separate backend lookup such as:

```text
sessionId → spreadsheetId
```

---

# 7. Google Sheets Data Model

The Sheet should contain explicit sections/tables rather than relying on arbitrary cell positions.

Use a schema that can be evolved through a schema/version field.

Suggested structure:

```text
META
key                value
schema_version     1
currency           INR
created_at         ...
```

```text
USERS
user_id            name
...
```

```text
ITEMS
item_id            name              quantity       amount
...
```

```text
CLAIMS
user_id            item_id           quantity
...
```

The exact columns should be adapted to the existing SnapSplit domain model.

The important requirement is that the model must support:

* multiple users
* bill items
* item quantities
* individual claims
* integer claim quantities
* updates from multiple participants

For example, an item such as:

```text
Tofu Biryani | quantity = 2 | amount = 360
```

must allow:

```text
Alice claims 1
Bob claims 1
```

rather than treating the entire item as belonging to one user.

Do not duplicate the entire application state into a single serialized JSON cell unless there is a strong existing architectural reason to do so. Structured tables will make debugging and future evolution easier.

---

# 8. Local State Reconstruction

The Google Sheet is the persistent source of truth.

The application should have a clear conversion layer:

```text
Google Sheet
     ↓
Sheet parser
     ↓
Domain model
     ↓
Existing SnapSplit state/UI
```

and the reverse:

```text
User action
     ↓
Domain state mutation
     ↓
Sheet persistence operation
     ↓
Google Sheet
```

Do not make the UI directly manipulate arbitrary spreadsheet cells.

Introduce a dedicated Google Sheets data-access layer.

For example:

```text
GoogleSheetsClient
        │
        ├── loadParty()
        ├── initializeParty()
        ├── addUser()
        ├── addClaim()
        ├── updateClaim()
        └── ...
```

Names should follow the existing project's conventions.

---

# 9. User Identity

A participant needs a stable identifier.

Prefer the authenticated Google account identity rather than using only the displayed name.

The Sheet should therefore contain something equivalent to:

```text
user_id | name
```

where `user_id` is derived from the authenticated Google identity in a privacy-conscious way.

Do not expose unnecessary Google profile information in the Sheet.

The UI can separately allow the user to choose/edit their display name if that is already part of SnapSplit's UX.

A participant opening the same party on another device should be recognized as the same Google user.

---

# 10. Adding a User

When a participant joins a party:

1. Load the current Sheet state.
2. Check whether the authenticated user is already present.
3. If not present, prompt for/derive their display name according to the existing UX.
4. Add the user to the `USERS` section.
5. Persist the change.
6. Update local state.

Do not create duplicate users when the same participant reloads the application.

---

# 11. Claiming Items

Existing SnapSplit claiming functionality should continue to operate against the reconstructed domain state.

When a user claims an item:

```text
Local UI
   ↓
Validate claim
   ↓
Update local state
   ↓
Write/update CLAIMS in Google Sheet
```

Claims must remain integer quantities.

For an item with quantity `2`:

```text
Alice → 1
Bob   → 1
```

is valid.

The implementation must prevent:

```text
Alice → 2
Bob   → 1
```

unless the item quantity is at least `3`.

The existing bill-splitting validation logic should remain the source for these rules where possible.

---

# 12. Synchronization

There is no backend or real-time server.

Therefore, synchronization is explicitly **Google Sheet based**.

For the initial implementation:

* load state when entering a party
* write changes immediately after successful local mutations
* provide a refresh/reload mechanism
* reload state when the user re-enters the party

Do not implement WebSockets or polling unless already required elsewhere in the project.

The first version does not need to solve simultaneous-write conflict resolution comprehensively.

However, writes should be designed so that unrelated changes are not unnecessarily overwritten.

For example, avoid:

```text
read entire Sheet
modify local copy
write entire Sheet
```

for every small mutation if this can cause one user's changes to overwrite another user's changes.

Prefer targeted updates:

```text
Add user → append/update USERS
Add claim → append/update CLAIMS
Change claim → update corresponding CLAIMS row
```

---

# 13. Concurrency Considerations

Multiple participants can have the same Sheet open simultaneously.

The implementation should assume that the Sheet may change between reads and writes.

At minimum:

* fetch current state before significant mutations where necessary
* perform targeted writes
* refresh state after writes
* surface API conflicts/errors rather than silently losing data

Do not claim that the frontend provides transactional guarantees.

Strong conflict resolution is outside the scope of this feature.

---

# 14. Spreadsheet URL Handling

Support standard Google Sheets URLs such as:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

The parser should extract:

```text
SPREADSHEET_ID
```

without depending on the `/edit` suffix.

Reject:

* non-Google URLs
* malformed Sheets URLs
* empty input
* unsupported Google document types

Do not store the entire URL as the internal identifier. Store the extracted spreadsheet ID.

---

# 15. Error Handling

Provide explicit errors for at least:

### Not authenticated

```text
You need to sign in with Google before joining a party.
```

### Invalid URL

```text
This doesn't appear to be a valid Google Sheets link.
```

### No access

```text
You don't have access to this Google Sheet.
Ask the bill owner to update the Sheet's sharing permissions.
```

### Non-empty uninitialized Sheet

```text
This Sheet contains existing data and isn't a SnapSplit party.
Please provide an empty Google Sheet.
```

### Invalid SnapSplit Sheet

```text
This Google Sheet isn't a valid SnapSplit party.
```

### Google API failure

Handle expired/revoked authentication and transient API failures without corrupting local state.

Do not silently fall back to a local-only party if the application believes the user is operating on a shared party.

---

# 16. Security Requirements

The architecture intentionally relies on Google for access control.

SnapSplit must:

* never store Google OAuth client secrets in the frontend
* never hard-code access tokens
* never send OAuth tokens to a SnapSplit backend
* request only required Google scopes
* use the authenticated Google identity for API calls
* avoid logging OAuth tokens
* avoid putting OAuth tokens in URLs
* avoid putting unnecessary personal Google profile information into the Sheet

The Google Sheets sharing configuration is considered an external responsibility for this feature.

SnapSplit should not attempt to implement its own access-control system on top of Google Sheets permissions.

---

# 17. OAuth Client ID

The Google OAuth client ID is public configuration.

It is acceptable for it to exist in:

```text
.env
```

and be exposed to the frontend at build time, or directly in frontend configuration where appropriate.

For example:

```text
VITE_GOOGLE_CLIENT_ID=...
```

Do not treat the client ID as a secret.

Do not add a client secret to the frontend.

If the repository contains environment configuration, follow the existing project's convention for public frontend environment variables.

---

# 18. State Lifecycle

The intended lifecycle is:

```text
Google Login
     │
     ▼
Create / Join
     │
     ▼
Enter Google Sheet URL
     │
     ▼
Extract Spreadsheet ID
     │
     ▼
Google Sheets API
     │
     ├── Create → initialize Sheet
     │
     └── Join → validate existing Sheet
     │
     ▼
Load Sheet → Domain State
     │
     ▼
Existing SnapSplit UI
     │
     ▼
User actions
     │
     ▼
Targeted Sheet mutations
```

The browser may retain the current spreadsheet ID during the current application session, but there should be no server-side session record.

---

# 19. Out of Scope

Do not implement the following as part of this feature:

* SnapSplit backend
* SnapSplit database
* server-side session management
* WebSockets
* real-time presence
* invitation service
* email invitations
* automatic Google Drive file creation
* automatic Google Drive permission management
* historical party storage beyond what naturally remains in the user's Sheet
* advanced concurrent-edit conflict resolution
* anonymous users
* custom authentication

Google Sheets is the persistence and sharing mechanism.

---

# 20. Implementation Guidance

Before changing code:

1. Inspect the existing authentication implementation.
2. Inspect the existing bill/domain state model.
3. Inspect the existing item/claim functionality.
4. Identify the existing routing/navigation structure.
5. Identify the current environment/configuration mechanism.
6. Reuse existing abstractions where possible rather than introducing parallel implementations.

Implement the feature in layers:

```text
Google OAuth
     ↓
Google Sheets API client
     ↓
Sheet schema/parser
     ↓
Party repository/data-access layer
     ↓
Existing SnapSplit domain state
     ↓
Create/Join UI
```

Keep Google-specific logic isolated from the existing bill-splitting logic.

The existing UI/domain functionality should ideally not need to know that the persistence layer is Google Sheets.

---

# 21. Acceptance Criteria

The implementation is complete when all of the following work:

### Authentication

* [ ] An unauthenticated user cannot create or join a party.
* [ ] Google authentication works through the existing OAuth flow.
* [ ] The frontend contains only the OAuth client ID, not a client secret.
* [ ] Only the required Google API scopes are requested.

### Create Party

* [ ] User can choose Create Party.
* [ ] User can paste a Google Sheets URL.
* [ ] App validates access to the Sheet.
* [ ] App initializes an empty Sheet with the SnapSplit schema.
* [ ] App loads the party into the existing SnapSplit UI.

### Join Party

* [ ] User can choose Join Party.
* [ ] User can paste the same Google Sheets URL.
* [ ] App extracts the spreadsheet ID.
* [ ] App authenticates the user with Google.
* [ ] App reads the existing Sheet.
* [ ] App reconstructs the party state.
* [ ] App loads the existing users/items/claims.

### Collaboration

* [ ] A second user can open the same Sheet URL.
* [ ] The second user can add themselves.
* [ ] The second user can claim items.
* [ ] Their changes are persisted to the bill owner's Sheet.
* [ ] The original user can refresh/reload and see those changes.
* [ ] Multiple users can modify different claims without the application unnecessarily replacing unrelated Sheet data.

### Failure handling

* [ ] Invalid Sheets URLs are rejected.
* [ ] Inaccessible Sheets produce a clear error.
* [ ] Uninitialized non-empty Sheets are not overwritten.
* [ ] Invalid SnapSplit Sheets are rejected.
* [ ] Google API/authentication failures are surfaced cleanly.

### Architecture

* [ ] No SnapSplit backend is introduced.
* [ ] No database is introduced.
* [ ] No server-side session mapping is introduced.
* [ ] Google Sheets remains the authoritative persistent party state.
* [ ] Existing SnapSplit bill/claim functionality remains usable independently of the Google-specific persistence implementation.
