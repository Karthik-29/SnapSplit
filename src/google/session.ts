import { createSpreadsheet, getSpreadsheetValues, setSpreadsheetAnyonePermission, writeSpreadsheetValues } from './drive';
import { SessionData } from '../session/models';

const SESSION_CELL_RANGE = 'Sheet1!A1';

export async function createSharedSessionSpreadsheet(
  accessToken: string,
  title: string,
  session: Omit<SessionData, 'sessionSecret'>
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; session: SessionData }> {
  const created = await createSpreadsheet(accessToken, title);
  await setSpreadsheetAnyonePermission(accessToken, created.spreadsheetId, 'writer');

  const savedSession: SessionData = {
    ...session,
    sessionSecret: created.spreadsheetId,
    sheetId: created.spreadsheetId,
  };

  await writeSpreadsheetValues(accessToken, created.spreadsheetId, SESSION_CELL_RANGE, [[JSON.stringify(savedSession)]]);
  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
    session: savedSession,
  };
}

export async function loadSharedSessionFromSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<SessionData> {
  const values = await getSpreadsheetValues(accessToken, spreadsheetId, SESSION_CELL_RANGE);
  const json = values?.[0]?.[0];
  if (!json) {
    throw new Error('Shared session data not found in spreadsheet.');
  }

  const session = JSON.parse(json) as SessionData;
  return {
    ...session,
    sheetId: spreadsheetId,
    sessionSecret: spreadsheetId,
  };
}

export async function saveSharedSessionToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  session: SessionData
): Promise<void> {
  await writeSpreadsheetValues(accessToken, spreadsheetId, SESSION_CELL_RANGE, [[JSON.stringify(session)]]);
}
