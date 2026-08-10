export type SpreadsheetCreationResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
};

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function createSpreadsheet(accessToken: string, title: string): Promise<SpreadsheetCreationResult> {
  const response = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { title } }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to create spreadsheet: ${errorBody}`);
  }

  const data = await response.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
  };
}

export async function writeSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: Array<Array<string | number>>
): Promise<void> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to write values to spreadsheet: ${errorBody}`);
  }
}

export async function getSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<Array<Array<string>>> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to read spreadsheet values: ${errorBody}`);
  }

  const data = await response.json();
  return data.values ?? [];
}

export async function setSpreadsheetAnyonePermission(
  accessToken: string,
  spreadsheetId: string,
  role: 'reader' | 'writer' = 'writer'
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions?sendNotificationEmail=false`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role,
      type: 'anyone',
      allowFileDiscovery: false,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to set spreadsheet permissions: ${errorBody}`);
  }
}

export async function batchUpdateSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  data: Array<{ range: string; values: Array<Array<string | number>> }>
): Promise<void> {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to batch update spreadsheet values: ${errorBody}`);
  }
}
