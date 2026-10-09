import { gfetch } from './api'
import type { Cell } from '../data/schema'

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
const DRIVE = 'https://www.googleapis.com/drive/v3/files'

export async function findSpreadsheetByName(name: string): Promise<string | null> {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  const r = await gfetch<{ files: { id: string }[] }>(
    `${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id)&orderBy=createdTime&pageSize=5`,
  )
  return r.files[0]?.id ?? null
}

export async function getSheetTitles(spreadsheetId: string): Promise<string[]> {
  const r = await gfetch<{ sheets: { properties: { title: string } }[] }>(
    `${SHEETS}/${spreadsheetId}?fields=sheets.properties.title`,
  )
  return r.sheets.map((s) => s.properties.title)
}

export function createSpreadsheet(body: unknown) {
  return gfetch<{ spreadsheetId: string }>(SHEETS, { method: 'POST', body: JSON.stringify(body) })
}

export function spreadsheetBatchUpdate(spreadsheetId: string, requests: unknown[]) {
  return gfetch(`${SHEETS}/${spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) })
}

export async function batchGet(spreadsheetId: string, ranges: string[]): Promise<Cell[][][]> {
  const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
  const r = await gfetch<{ valueRanges: { values?: Cell[][] }[] }>(
    `${SHEETS}/${spreadsheetId}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  )
  return r.valueRanges.map((v) => v.values ?? [])
}

export interface RangeWrite {
  range: string
  values: (Cell | null)[][] // null = leave that cell unchanged
}

export function valuesBatchUpdate(spreadsheetId: string, data: RangeWrite[]) {
  return gfetch(`${SHEETS}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  })
}

/** Tab title → numeric sheetId (needed for row deletion). */
export async function getSheetIds(spreadsheetId: string): Promise<Record<string, number>> {
  const r = await gfetch<{ sheets: { properties: { title: string; sheetId: number } }[] }>(
    `${SHEETS}/${spreadsheetId}?fields=sheets.properties(title,sheetId)`,
  )
  return Object.fromEntries(r.sheets.map((s) => [s.properties.title, s.properties.sheetId]))
}

/** Permanently deletes rows (1-based row numbers) from tabs, bottom-up so numbers stay valid. */
export async function deleteRows(spreadsheetId: string, rowsByTab: Record<string, number[]>) {
  const ids = await getSheetIds(spreadsheetId)
  const requests = Object.entries(rowsByTab).flatMap(([tab, rows]) =>
    [...new Set(rows)]
      .sort((a, b) => b - a)
      .map((row) => ({ deleteDimension: { range: { sheetId: ids[tab], dimension: 'ROWS', startIndex: row - 1, endIndex: row } } })),
  )
  if (requests.length) await spreadsheetBatchUpdate(spreadsheetId, requests)
}
