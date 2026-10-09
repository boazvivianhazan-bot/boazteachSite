// Finds (or creates) the "Lessons DB" spreadsheet and loads every tab.
import { SHEET_NAME, TIMEZONE } from '../config'
import { ApiError } from '../lib/api'
import { batchGet, createSpreadsheet, findSpreadsheetByName, getSheetTitles, spreadsheetBatchUpdate, valuesBatchUpdate } from '../lib/sheets'
import { COLUMNS, DEFAULT_SETTINGS, SEED_LESSON_TYPES, TABLE_NAMES, settingsToKv, toRow, type Cell, type TableName } from './schema'

// The spreadsheet id is not personal data; caching it just skips a Drive lookup.
const ID_KEY = 'lessonsDbId'

export interface RawDb {
  spreadsheetId: string
  created: boolean
  tables: Record<TableName, Cell[][]> // includes header row
}

function seedRows(t: TableName): Cell[][] {
  if (t === 'LessonTypes') return SEED_LESSON_TYPES.map(toRow.LessonTypes)
  if (t === 'Settings') return settingsToKv(DEFAULT_SETTINGS)
  return []
}

function cellData(v: Cell, header = false) {
  const userEnteredValue =
    typeof v === 'number' ? { numberValue: v } : typeof v === 'boolean' ? { boolValue: v } : { stringValue: v }
  return header ? { userEnteredValue, userEnteredFormat: { textFormat: { bold: true } } } : { userEnteredValue }
}

async function create(): Promise<string> {
  const { spreadsheetId } = await createSpreadsheet({
    properties: { title: SHEET_NAME, timeZone: TIMEZONE },
    sheets: TABLE_NAMES.map((t, i) => ({
      properties: { sheetId: i, title: t, rightToLeft: true, gridProperties: { frozenRowCount: 1 } },
      data: [
        {
          startRow: 0,
          startColumn: 0,
          rowData: [
            { values: COLUMNS[t].map((h) => cellData(h, true)) },
            ...seedRows(t).map((r) => ({ values: r.map((c) => cellData(c)) })),
          ],
        },
      ],
    })),
  })
  return spreadsheetId
}

/** Adds any tab that was deleted by hand, with headers (and seed rows). */
async function ensureTabs(spreadsheetId: string) {
  const titles = await getSheetTitles(spreadsheetId)
  const missing = TABLE_NAMES.filter((t) => !titles.includes(t))
  if (!missing.length) return
  await spreadsheetBatchUpdate(
    spreadsheetId,
    missing.map((title) => ({ addSheet: { properties: { title, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } } })),
  )
  await valuesBatchUpdate(
    spreadsheetId,
    missing.map((t) => ({ range: `${t}!A1`, values: [[...COLUMNS[t]], ...seedRows(t)] })),
  )
}

async function locate(): Promise<{ id: string; created: boolean }> {
  let id: string | null = null
  try {
    id = localStorage.getItem(ID_KEY)
  } catch {
    /* ignore */
  }
  if (id) {
    try {
      await ensureTabs(id)
      return { id, created: false }
    } catch (e) {
      // Trashed, deleted or no longer accessible → fall back to search by name.
      if (!(e instanceof ApiError && ([400, 403, 404].includes(e.status)))) throw e
    }
  }
  id = await findSpreadsheetByName(SHEET_NAME)
  if (id) {
    await ensureTabs(id)
    return { id, created: false }
  }
  return { id: await create(), created: true }
}

let inflight: Promise<RawDb> | null = null

/** Single-flight: concurrent callers (e.g. React StrictMode) share one run. */
export function openDatabase(): Promise<RawDb> {
  if (!inflight) {
    inflight = (async () => {
      const { id, created } = await locate()
      try {
        localStorage.setItem(ID_KEY, id)
      } catch {
        /* ignore */
      }
      const values = await batchGet(
        id,
        TABLE_NAMES.map((t) => `${t}!A1:ZZ`),
      )
      const tables = Object.fromEntries(TABLE_NAMES.map((t, i) => [t, values[i]])) as RawDb['tables']
      return { spreadsheetId: id, created, tables }
    })().finally(() => {
      inflight = null
    })
  }
  return inflight
}
