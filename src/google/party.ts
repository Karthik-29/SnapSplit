import { BillState, ItemClaim, Participant } from '../bill/models';
import { BillItem } from '../receipt/models';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCHEMA_VERSION = '1';
const SHEETS = { meta: 'META', users: 'USERS', items: 'ITEMS', claims: 'CLAIMS' } as const;
const headers = {
  meta: [['key', 'value']],
  users: [['user_id', 'name']],
  items: [['item_id', 'name', 'quantity', 'unit_price', 'total_price']],
  claims: [['item_id', 'user_id', 'quantity', 'mode']],
};

/**
 * Whether this browser session created the party or joined an existing one.
 * Client-side only, never written to the Sheet — this is a local UI hint
 * (e.g. hiding the Upload tab for participants), not access control. Drive
 * and Sheets sharing permissions remain the actual access control.
 */
export type PartyRole = 'owner' | 'participant';
export type Party = { spreadsheetId: string; state: BillState; role: PartyRole };
type Values = Array<Array<string | number>>;

export function extractSpreadsheetId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname !== 'docs.google.com') return null;
    const match = parsed.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch { return null; }
}

async function request<T = any>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const requestHeaders = new Headers(options.headers);
  requestHeaders.set('Authorization', `Bearer ${token}`);
  requestHeaders.set('Content-Type', 'application/json');
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: requestHeaders,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("You don't have access to this Google Sheet. Ask the bill owner to update the Sheet's sharing permissions.");
    }
    throw new Error(`Google Sheets request failed (${response.status}).`);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

async function metadata(token: string, id: string): Promise<{ sheets: Array<{ properties: { sheetId: number; title: string } }> }> {
  return request(token, `/${id}?fields=sheets.properties`);
}

async function getValues(token: string, id: string, range: string): Promise<string[][]> {
  const data = await request(token, `/${id}/values/${encodeURIComponent(range)}`);
  return data.values ?? [];
}

async function batch(token: string, id: string, requests: unknown[]) {
  await request(token, `/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
}

async function update(token: string, id: string, range: string, values: Values) {
  await request(token, `/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT', body: JSON.stringify({ values }),
  });
}

async function append(token: string, id: string, range: string, values: Values) {
  await request(token, `/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', body: JSON.stringify({ values }),
  });
}

export async function initializeParty(token: string, spreadsheetId: string): Promise<void> {
  const info = await metadata(token, spreadsheetId);
  const names = info.sheets.map((sheet) => sheet.properties.title);
  if (names.includes(SHEETS.meta)) {
    const meta = await getValues(token, spreadsheetId, `${SHEETS.meta}!A1:B10`);
    if (meta.some((row) => row[0] === 'schema_version' && row[1] === SCHEMA_VERSION)) return;
    throw new Error("This Google Sheet isn't a valid SnapSplit party.");
  }

  // Only a pristine, default Google Sheet may be initialized. We never replace
  // arbitrary user content or an unfamiliar workbook structure.
  if (info.sheets.length !== 1 || names[0] !== 'Sheet1') {
    throw new Error("This Sheet contains existing data and isn't a SnapSplit party. Please provide an empty Google Sheet.");
  }
  const existing = await getValues(token, spreadsheetId, 'Sheet1!A1:Z100');
  if (existing.some((row) => row.some((cell) => String(cell).trim()))) {
    throw new Error("This Sheet contains existing data and isn't a SnapSplit party. Please provide an empty Google Sheet.");
  }
  await batch(token, spreadsheetId, [
    { updateSheetProperties: { properties: { sheetId: info.sheets[0].properties.sheetId, title: SHEETS.meta }, fields: 'title' } },
    { addSheet: { properties: { title: SHEETS.users } } },
    { addSheet: { properties: { title: SHEETS.items } } },
    { addSheet: { properties: { title: SHEETS.claims } } },
  ]);
  await Promise.all([
    update(token, spreadsheetId, `${SHEETS.meta}!A1:B4`, [...headers.meta, ['schema_version', SCHEMA_VERSION], ['currency', 'INR'], ['created_at', new Date().toISOString()]]),
    update(token, spreadsheetId, `${SHEETS.users}!A1:B1`, headers.users),
    update(token, spreadsheetId, `${SHEETS.items}!A1:E1`, headers.items),
    update(token, spreadsheetId, `${SHEETS.claims}!A1:D1`, headers.claims),
  ]);
}

// Role isn't known here — the caller (create vs. join vs. refresh) decides it.
export async function loadParty(token: string, spreadsheetId: string): Promise<Omit<Party, 'role'>> {
  const info = await metadata(token, spreadsheetId);
  const names = new Set(info.sheets.map((sheet) => sheet.properties.title));
  if (![SHEETS.meta, SHEETS.users, SHEETS.items, SHEETS.claims].every((name) => names.has(name))) {
    throw new Error("This Google Sheet isn't a valid SnapSplit party.");
  }
  const [meta, users, items, claims] = await Promise.all([
    getValues(token, spreadsheetId, `${SHEETS.meta}!A1:B20`), getValues(token, spreadsheetId, `${SHEETS.users}!A1:B1000`),
    getValues(token, spreadsheetId, `${SHEETS.items}!A1:E1000`), getValues(token, spreadsheetId, `${SHEETS.claims}!A1:D5000`),
  ]);
  if (!meta.some((row) => row[0] === 'schema_version' && row[1] === SCHEMA_VERSION)) throw new Error("This Google Sheet isn't a valid SnapSplit party.");
  const participants: Participant[] = users.slice(1).filter((r) => r[0] && r[1]).map((r) => ({ id: r[0], name: r[1] }));
  const receiptItems: BillItem[] = items.slice(1).filter((r) => r[0]).map((r) => ({ id: r[0], name: r[1] || 'Unnamed item', quantity: Number(r[2]) || 0, unitPrice: Number(r[3]) || 0, totalPrice: Number(r[4]) || 0 }));
  const itemClaims: ItemClaim[] = receiptItems.map((item) => {
    const rows = claims.slice(1).filter((r) => r[0] === item.id);
    const shared = rows.find((r) => r[3] === 'shared');
    return {
      itemId: item.id,
      mode: shared ? 'shared' : 'individual',
      sharedWith: rows.filter((r) => r[3] === 'shared').map((r) => r[1]),
      individualQuantities: Object.fromEntries(rows.filter((r) => r[3] !== 'shared' && r[1]).map((r) => [r[1], Number(r[2]) || 0])),
    };
  });
  return { spreadsheetId, state: { receiptItems, participants, itemClaims } };
}

async function syncRows(token: string, id: string, sheet: string, keyIndexes: number[], desired: string[][]) {
  const existing = await getValues(token, id, `${sheet}!A1:Z5000`);
  const keyFor = (row: string[]) => keyIndexes.map((index) => row[index] ?? '').join('\u0000');
  const positions = new Map(existing.slice(1).map((row, index) => [keyFor(row), index + 2]));
  const currentByKey = new Map(existing.slice(1).map((row) => [keyFor(row), row]));
  const writes: Promise<void>[] = [];
  for (const row of desired) {
    const position = positions.get(keyFor(row));
    const current = currentByKey.get(keyFor(row));
    if (current && row.every((cell, index) => current[index] === cell)) continue;
    writes.push(position ? update(token, id, `${sheet}!A${position}:Z${position}`, [row]) : append(token, id, `${sheet}!A:Z`, [row]));
  }
  await Promise.all(writes);
}

export async function syncParty(token: string, party: Pick<Party, 'spreadsheetId' | 'state'>): Promise<void> {
  const { spreadsheetId, state } = party;
  await syncRows(token, spreadsheetId, SHEETS.users, [0], state.participants.map((p) => [p.id, p.name]));
  await syncRows(token, spreadsheetId, SHEETS.items, [0], state.receiptItems.map((i) => [i.id, i.name, String(i.quantity), String(i.unitPrice), String(i.totalPrice)]));
  // Claims have a stable composite key, so rewrite only the changed logical rows.
  const claims = state.itemClaims.flatMap((claim) => claim.mode === 'shared'
    ? claim.sharedWith.map((userId) => [claim.itemId, userId, '0', 'shared'])
    : Object.entries(claim.individualQuantities).map(([userId, quantity]) => [claim.itemId, userId, String(quantity), 'individual']));
  await syncRows(token, spreadsheetId, SHEETS.claims, [0, 1], claims);
}
