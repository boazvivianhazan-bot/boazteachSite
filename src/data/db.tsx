// In-memory cache of the "Lessons DB" sheet for this session, plus writes.
//
// Robustness rules (the sheet may be edited by hand at any time):
//  - Rows are always located by id, read fresh from the sheet right before
//    every write — never by a row number remembered from earlier.
//  - Columns are located by header name; missing columns are re-added.
//  - New rows go into the first completely empty row, else after the last row.
//    A row with any content is never overwritten by a new record.
//  - Writes run one at a time, so two saves can't claim the same row.
//  - Rows cleared by hand are reused by the next new records (first empty row
//    first), so gaps fill up. Rows are never deleted by position — that could hit
//    the wrong row if another device changed the sheet at the same moment.
//  - On load: rows without an id get one, and duplicate ids are renamed.
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Spinner, ErrorBox } from '../components/ui'
import { errorText } from '../lib/api'
import { batchGet, deleteRows, valuesBatchUpdate, type RangeWrite } from '../lib/sheets'
import { openDatabase, type RawDb } from './bootstrap'
import {
  COLUMNS, fromRow, newId, settingsFromKv, settingsToKv, toRow,
  type Cell, type Lesson, type LessonType, type Series, type Settings, type Student, type TableName,
} from './schema'

export interface Snapshot {
  spreadsheetId: string
  lessonTypes: LessonType[]
  students: Student[]
  lessons: Lesson[]
  series: Series[]
  settings: Settings
}

type RowTable = 'LessonTypes' | 'Students' | 'Lessons' | 'Series'
type ItemOf<T extends RowTable> = T extends 'LessonTypes'
  ? LessonType
  : T extends 'Students'
    ? Student
    : T extends 'Series'
      ? Series
      : Lesson
const SNAP_KEY: Record<RowTable, 'lessonTypes' | 'students' | 'lessons' | 'series'> = {
  LessonTypes: 'lessonTypes',
  Students: 'students',
  Lessons: 'lessons',
  Series: 'series',
}
const KEY_COL: Record<TableName, string> = { LessonTypes: 'id', Students: 'id', Lessons: 'id', Series: 'seriesId', Settings: 'key' }
const ID_PREFIX: Record<RowTable, string> = { LessonTypes: 'lt', Students: 'st', Lessons: 'ls', Series: 'sr' }

/** One record to write: matched by its key, cells by column name. */
interface RowWrite {
  table: TableName
  key: string
  cells: Record<string, Cell>
}

const str = (v: Cell | undefined | null) => (v === undefined || v === null ? '' : String(v).trim())
const isEmptyRow = (r: (Cell | undefined)[] | undefined) => !r || r.every((v) => str(v) === '')

function colLetter(i: number) {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Header + rows of a tab as read from the sheet, with the key column located. */
class TabView {
  header: string[]
  rows: Cell[][] // index 0 = header row
  constructor(public table: TableName, rows: Cell[][]) {
    this.rows = rows.length ? rows : [[]]
    this.header = (this.rows[0] ?? []).map((h) => str(h))
  }
  col(name: string) {
    return this.header.indexOf(name)
  }
  /** Columns the app needs that the header lacks (deleted or renamed by hand). */
  missingColumns() {
    return COLUMNS[this.table].filter((c) => !this.header.includes(c))
  }
  /** Row values reordered into the app's column order. */
  canonical(r: Cell[]): (Cell | undefined)[] {
    return COLUMNS[this.table].map((c) => {
      const i = this.col(c)
      return i >= 0 ? r[i] : undefined
    })
  }
  keyAt(rowIdx: number) {
    const k = this.col(KEY_COL[this.table])
    return k >= 0 ? str(this.rows[rowIdx]?.[k]) : ''
  }
}

export class Database {
  snapshot: Snapshot
  /** Hebrew notes about what was repaired in the sheet on load. */
  repairs: string[] = []
  private listeners = new Set<() => void>()
  private spreadsheetId: string
  private settingsKeys = new Set<string>()
  private lock: Promise<unknown> = Promise.resolve()
  private pending: { w: RowWrite; resolve: () => void; reject: (e: unknown) => void }[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  // Load-time repairs, applied by repairOnLoad().
  private idFixes: { table: TableName; row: number; id: string; was: string }[] = []
  private headerFixes: TableName[] = []
  readonly studentsToMigrate: Student[] = []

  constructor(raw: RawDb) {
    this.spreadsheetId = raw.spreadsheetId
    const views = Object.fromEntries(
      (Object.keys(COLUMNS) as TableName[]).map((t) => [t, new TabView(t, raw.tables[t])]),
    ) as Record<TableName, TabView>

    for (const t of Object.keys(views) as TableName[]) {
      const v = views[t]
      if (v.missingColumns().length) this.headerFixes.push(t)
    }

    const parse = <T extends RowTable>(t: T): ItemOf<T>[] => {
      const v = views[t]
      const seen = new Set<string>()
      const out: ItemOf<T>[] = []
      v.rows.slice(1).forEach((r, i) => {
        if (isEmptyRow(r)) return
        const c = v.canonical(r)
        let id = str(c[0])
        if (!id || seen.has(id)) {
          // Row typed by hand without an id, or a copy-pasted duplicate: give it its own id.
          const was = id
          id = newId(ID_PREFIX[t])
          this.idFixes.push({ table: t, row: i + 2, id, was })
          c[0] = id
        }
        seen.add(id)
        const item = (fromRow[t] as (r: Cell[]) => ItemOf<T>)(c as Cell[])
        out.push(item)
        if (t === 'Students') {
          const st = item as Student
          if (str(c[10]) !== st.allowedLessonTypeIds.join(',')) this.studentsToMigrate.push(st)
        }
      })
      return out
    }

    const kv = new Map<string, string>()
    const sv = views.Settings
    sv.rows.slice(1).forEach((r) => {
      const c = sv.canonical(r)
      const k = str(c[0])
      if (!k || kv.has(k)) return
      kv.set(k, str(c[1]))
      this.settingsKeys.add(k)
    })

    this.snapshot = {
      spreadsheetId: raw.spreadsheetId,
      lessonTypes: parse('LessonTypes'),
      students: parse('Students'),
      lessons: parse('Lessons'),
      series: parse('Series'),
      settings: settingsFromKv(kv),
    }
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }
  getSnapshot = () => this.snapshot

  private commit(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((l) => l())
  }

  /** Runs sheet operations one at a time. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.lock.then(fn, fn)
    this.lock = p.catch(() => {})
    return p
  }

  private async readTabs(tables: TableName[]) {
    const values = await batchGet(this.spreadsheetId, tables.map((t) => `${t}!A1:ZZ`))
    return Object.fromEntries(tables.map((t, i) => [t, new TabView(t, values[i])])) as Record<TableName, TabView>
  }

  // ---- writes ---------------------------------------------------------------

  private enqueue(writes: RowWrite[]): Promise<void> {
    return Promise.all(
      writes.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            this.pending.push({ w, resolve, reject })
            if (!this.timer) this.timer = setTimeout(() => this.flush(), 40)
          }),
      ),
    ).then(() => undefined)
  }

  private flush() {
    this.timer = null
    const batch = this.pending
    this.pending = []
    this.exclusive(() => this.writeRows(batch.map((b) => b.w))).then(
      () => batch.forEach((b) => b.resolve()),
      (e) => batch.forEach((b) => b.reject(e)),
    )
  }

  /** Reads the affected tabs fresh, finds each record's row by key, then writes. */
  private async writeRows(writes: RowWrite[]) {
    const tables = [...new Set(writes.map((w) => w.table))]
    const views = await this.readTabs(tables)
    const data: RangeWrite[] = []

    for (const t of tables) {
      const v = views[t]
      const missing = v.missingColumns()
      if (missing.length) {
        v.header = [...v.header, ...missing]
        data.push({ range: `${t}!A1`, values: [v.header] })
      }
      const occupied = v.rows.map((r, i) => i === 0 || !isEmptyRow(r))
      const rowOfKey = new Map<string, number>()
      for (let i = 1; i < v.rows.length; i++) {
        const k = v.keyAt(i)
        if (k && !rowOfKey.has(k)) rowOfKey.set(k, i)
      }
      for (const w of writes.filter((x) => x.table === t)) {
        let idx = rowOfKey.get(w.key)
        if (idx === undefined) {
          // New record (or its row was deleted by hand): first fully empty row, else append.
          idx = occupied.findIndex((o, i) => i > 0 && !o)
          if (idx === -1) idx = occupied.length
          occupied[idx] = true
          rowOfKey.set(w.key, idx)
        }
        // null = leave cell unchanged (e.g. extra columns added by hand).
        const row = v.header.map((h) => (h in w.cells ? w.cells[h] : null))
        data.push({ range: `${t}!A${idx + 1}:${colLetter(row.length - 1)}${idx + 1}`, values: [row] })
      }
    }
    await valuesBatchUpdate(this.spreadsheetId, data)
  }

  /** Insert or update rows (matched by id). */
  async upsert<T extends RowTable>(table: T, items: ItemOf<T>[]) {
    if (!items.length) return
    const toCells = toRow[table] as (x: ItemOf<T>) => Cell[]
    await this.enqueue(
      items.map((it) => {
        const vals = toCells(it)
        return { table, key: it.id, cells: Object.fromEntries(COLUMNS[table].map((c, i) => [c, vals[i]])) }
      }),
    )
    const key = SNAP_KEY[table]
    const list = [...(this.snapshot[key] as ItemOf<T>[])]
    for (const it of items) {
      const i = list.findIndex((x) => x.id === it.id)
      if (i >= 0) list[i] = it
      else list.push(it)
    }
    this.commit({ [key]: list } as Partial<Snapshot>)
  }

  async saveSettings(next: Settings) {
    const prev = new Map(settingsToKv(this.snapshot.settings))
    const changed = settingsToKv(next).filter(([k, v]) => prev.get(k) !== v || !this.settingsKeys.has(k))
    if (changed.length) {
      await this.enqueue(changed.map(([k, v]) => ({ table: 'Settings' as const, key: k, cells: { key: k, value: v } })))
      changed.forEach(([k]) => this.settingsKeys.add(k))
    }
    this.commit({ settings: next })
  }

  // ---- load-time repair -----------------------------------------------------

  /** Writes the repairs found while loading. Safe to run on every load. */
  async repairOnLoad() {
    const notes: string[] = []
    await this.exclusive(async () => {
      const data: RangeWrite[] = []
      if (this.headerFixes.length) {
        const views = await this.readTabs(this.headerFixes)
        for (const t of this.headerFixes) {
          const v = views[t]
          const missing = v.missingColumns()
          if (missing.length) data.push({ range: `${t}!A1`, values: [[...v.header, ...missing]] })
        }
      }
      if (this.idFixes.length) {
        const views = await this.readTabs([...new Set(this.idFixes.map((f) => f.table))])
        // Only if the row still holds what it held at load time (another tab may have fixed it).
        const fixes = this.idFixes.filter((f) => {
          const v = views[f.table]
          return !isEmptyRow(v.rows[f.row - 1]) && v.keyAt(f.row - 1) === f.was
        })
        for (const f of fixes) {
          const k = Math.max(0, views[f.table].col(KEY_COL[f.table]))
          data.push({ range: `${f.table}!${colLetter(k)}${f.row}`, values: [[f.id]] })
        }
        if (fixes.length) notes.push(`${fixes.length} שורות בלי מזהה או עם מזהה כפול קיבלו מזהה חדש`)
      }
      if (data.length) await valuesBatchUpdate(this.spreadsheetId, data)
    })
    this.idFixes = []
    this.headerFixes = []
    // Missing settings keys (new sheet tab, or older format) and student format upgrades.
    if (settingsToKv(this.snapshot.settings).some(([k]) => !this.settingsKeys.has(k)) || this.snapshot.settings.sheetId !== this.spreadsheetId) {
      await this.saveSettings({ ...this.snapshot.settings, sheetId: this.spreadsheetId })
    }
    if (this.studentsToMigrate.length) await this.upsert('Students', this.studentsToMigrate)
    this.repairs = notes
  }

  // ---- the only hard delete -------------------------------------------------

  /** Permanently removes a student, their lessons and weekly series from the sheet (test data cleanup). */
  async hardDeleteStudent(studentId: string) {
    const lessonIds = new Set(this.snapshot.lessons.filter((l) => l.studentId === studentId).map((l) => l.id))
    const seriesIds = new Set(this.snapshot.series.filter((x) => x.studentId === studentId).map((x) => x.id))
    await this.exclusive(async () => {
      const views = await this.readTabs(['Students', 'Lessons', 'Series'])
      const rowsOf = (t: 'Students' | 'Lessons' | 'Series', match: (key: string) => boolean) => {
        const out: number[] = []
        for (let i = 1; i < views[t].rows.length; i++) if (match(views[t].keyAt(i))) out.push(i + 1)
        return out
      }
      await deleteRows(this.spreadsheetId, {
        Students: rowsOf('Students', (k) => k === studentId),
        Lessons: rowsOf('Lessons', (k) => lessonIds.has(k)),
        Series: rowsOf('Series', (k) => seriesIds.has(k)),
      })
    })
    this.commit({
      students: this.snapshot.students.filter((s) => s.id !== studentId),
      lessons: this.snapshot.lessons.filter((l) => !lessonIds.has(l.id)),
      series: this.snapshot.series.filter((x) => !seriesIds.has(x.id)),
    })
  }
}

let loading: Promise<Database> | null = null

/** Single-flight: load + repair run once even if requested twice at the same time. */
function loadDatabase(): Promise<Database> {
  if (!loading) {
    loading = (async () => {
      const d = new Database(await openDatabase())
      await d.repairOnLoad()
      return d
    })().finally(() => {
      loading = null
    })
  }
  return loading
}

const Ctx = createContext<{ db: Database; reload: () => void } | null>(null)

/** Loads the sheet once per session and provides it to the app. */
export function DbProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const [db, setDb] = useState<Database | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [repairNotice, setRepairNotice] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setError(null)
    loadDatabase()
      .then((d) => {
        if (!cancelled) {
          setDb(d)
          setRepairNotice(d.repairs)
        }
      })
      .catch((e) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Retry automatically after re-login if loading failed.
  useEffect(() => {
    if (state === 'valid' && error && !db) setAttempt((a) => a + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const reload = useCallback(() => {
    setDb(null)
    setAttempt((a) => a + 1)
  }, [])

  if (!db) {
    return (
      <div className="mx-auto max-w-md p-6 pt-24">
        {error ? (
          <ErrorBox message={`טעינת מסד הנתונים נכשלה. ${error}`} onRetry={() => setAttempt((a) => a + 1)} />
        ) : (
          <Spinner label="טוען את גיליון Lessons DB…" />
        )}
      </div>
    )
  }
  return (
    <Ctx.Provider value={{ db, reload }}>
      {repairNotice.length > 0 && (
        <div role="status" className="fixed inset-x-3 top-3 z-50 mx-auto max-w-md rounded-xl bg-amber-50 p-3 text-sm text-amber-900 shadow-lg">
          <div className="flex items-start gap-2">
            <p className="flex-1">
              <b>הגיליון תוקן אוטומטית:</b> {repairNotice.join('; ')}.
            </p>
            <button aria-label="סגירה" onClick={() => setRepairNotice([])} className="text-lg leading-none">
              ×
            </button>
          </div>
        </div>
      )}
      {children}
    </Ctx.Provider>
  )
}

export function useDb() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDb outside DbProvider')
  const data = useSyncExternalStore(c.db.subscribe, c.db.getSnapshot)
  return { ...data, db: c.db, reload: c.reload }
}
