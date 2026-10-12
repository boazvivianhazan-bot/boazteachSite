// Sheet layout, row <-> object conversion and seed data.

export interface LessonType {
  id: string
  name: string
  durationMin: number
  price: number
  isZoom: boolean
  color: string // Google Calendar event colorId "1".."11"
  active: boolean
  /** Price PER STUDENT in a group, by group size: "2", "3", "4" (= 4 or more). Missing = the regular price. */
  groupPrices: Partial<Record<'2' | '3' | '4', number>>
}

/** Per-student price of a lesson type for a group of `size` students (1 = a regular lesson). */
export function groupPrice(t: Pick<LessonType, 'price' | 'groupPrices'>, size: number): number {
  if (size <= 1) return t.price
  const key = String(Math.min(size, 4)) as '2' | '3' | '4'
  return t.groupPrices[key] ?? t.price
}

export interface Student {
  id: string
  name: string
  phone: string
  address: string
  buildingCode: string
  floorApt: string
  defaultLessonTypeId: string // always one of allowedLessonTypeIds (or '' if none)
  zoomLink: string
  notes: string
  active: boolean
  allowedLessonTypeIds: string[]
  parentName: string
  parentPhone: string // WhatsApp goes here when set
  familyId: string // students with the same familyId share one payer/balance ('' = pays alone)
  paysMonthly: boolean // "משלם בסוף חודש"
}

/** Money received. payerId = a student id, or a familyId shared by several students. */
export interface Payment {
  id: string
  date: string // yyyy-mm-dd
  payerId: string
  amount: number // 0 = cancelled payment (rows are never deleted)
  method: string
  notes: string
}

export type LessonStatus = 'planned' | 'done' | 'cancelled' | 'postponed'

/** Cancelled and postponed lessons don't happen: not drawn, not busy, not counted in income. */
export const isLive = (l: { status: LessonStatus }) => l.status === 'planned' || l.status === 'done'

export interface Lesson {
  id: string
  date: string // yyyy-mm-dd
  start: string // HH:mm
  end: string // HH:mm
  studentId: string
  studentName: string
  lessonTypeId: string
  price: number
  status: LessonStatus
  paid: boolean
  calendarEventId: string // '' = sheet only (e.g. a past lesson entered later)
  notes: string
  units: number // ×1 / ×2 / ×3 — a double lesson is one event and one row
  calendarId: string // calendar holding calendarEventId ('' = the lessons calendar from Settings)
  seriesId: string // weekly series this lesson belongs to ('' = one-off)
  seriesDate: string // the series week this lesson fills (stays the same if this one week is moved)
  dismissed: string[] // conflict ids the user chose to keep ("השאר")
  groupId: string // students in the same group lesson share it (and one calendar event); '' = one-on-one
}

/** A weekly lesson ("שיעור קבוע"). Each week becomes its own Lessons row + Calendar event. */
export interface Series {
  id: string
  studentId: string
  weekday: number // 0 = Sunday
  start: string // HH:mm
  lessonTypeId: string
  units: number
  startDate: string // first week (yyyy-mm-dd)
  endDate: string // last possible week, or '' = open-ended
  active: boolean
  unitPrice: number // per student (group price when it's a group)
  studentIds: string[] // all students of a group series (first = studentId); [studentId] when one-on-one
}

export interface TimeRange {
  start: string // HH:mm
  end: string // HH:mm
}

export interface DayHours {
  on: boolean
  ranges: TimeRange[] // kept while the day is off, so toggling back restores them
}

/** Calendar events whose title contains `keyword` are drawn in `color` with `label`. */
export interface HighlightRule {
  id: string
  keyword: string
  label: string
  color: string // #rrggbb
  important: boolean // warn when booking a lesson that overlaps or is within windowMin
  windowMin: number
  wholeWord: boolean // "מוקד" matches "במוקד" but not "מוקדמת"
}

export interface Settings {
  workHours: DayHours[] // index 0 = Sunday … 6 = Saturday
  bufferMin: number
  calendarId: string
  /** calendarId → shown in the app. Missing = follow Google Calendar's own checkbox. */
  calendarVisibility: Record<string, boolean>
  highlightRules: HighlightRule[]
  /** Format version of lesson event titles; bumping it triggers a one-time refresh of future events. */
  eventTitleVersion: number
  paymentMethods: string[]
  /** The old per-lesson "paid" marks were turned into payments (stage 6). */
  paymentsMigrated: boolean
  sheetId: string
}

export const COLUMNS = {
  LessonTypes: ['id', 'name', 'durationMin', 'price', 'isZoom', 'color', 'active', 'groupPrices'],
  Students: ['id', 'name', 'phone', 'address', 'buildingCode', 'floorApt', 'defaultLessonTypeId', 'zoomLink', 'notes', 'active', 'allowedLessonTypeIds', 'parentName', 'parentPhone', 'familyId', 'paysMonthly'],
  Lessons: ['id', 'date', 'start', 'end', 'studentId', 'studentName', 'lessonTypeId', 'price', 'status', 'paid', 'calendarEventId', 'notes', 'units', 'calendarId', 'seriesId', 'seriesDate', 'dismissed', 'groupId'],
  Series: ['seriesId', 'studentId', 'weekday', 'start', 'lessonTypeId', 'units', 'startDate', 'endDate', 'active', 'price', 'studentIds'],
  Payments: ['id', 'date', 'payerId', 'amount', 'method', 'notes'],
  Settings: ['key', 'value'],
} as const

export type TableName = keyof typeof COLUMNS
export const TABLE_NAMES = Object.keys(COLUMNS) as TableName[]

export type Cell = string | number | boolean

// ---- tolerant readers (the sheet may be hand-edited) ----------------------

const str = (v: Cell | undefined) => (v === undefined || v === null ? '' : String(v)).trim()
const num = (v: Cell | undefined) => {
  const n = typeof v === 'number' ? v : parseFloat(str(v).replace(/[₪,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const bool = (v: Cell | undefined, dflt = false) => {
  if (typeof v === 'boolean') return v
  const s = str(v).toLowerCase()
  if (!s) return dflt
  return s === 'true' || s === '1' || s === 'כן' || s === 'v'
}
/** Accepts "HH:mm" or a Sheets time serial (fraction of a day). */
const time = (v: Cell | undefined) => {
  if (typeof v === 'number') {
    const mins = Math.round((v % 1) * 24 * 60)
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  }
  const m = str(v).match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}
/** Accepts "yyyy-mm-dd", "dd/mm/yyyy" or a Sheets date serial. */
const date = (v: Cell | undefined) => {
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = str(v)
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return s.slice(0, 10)
}

function parseGroupPrices(v: Cell | undefined): LessonType['groupPrices'] {
  try {
    const o = JSON.parse(str(v) || '{}')
    const out: LessonType['groupPrices'] = {}
    for (const k of ['2', '3', '4'] as const) if (Number.isFinite(Number(o?.[k])) && o?.[k] !== '' && o?.[k] !== null) out[k] = Number(o[k])
    return out
  } catch {
    return {}
  }
}

export const fromRow = {
  LessonTypes: (r: Cell[]): LessonType => ({
    id: str(r[0]),
    name: str(r[1]),
    durationMin: num(r[2]) || 45,
    price: num(r[3]),
    isZoom: bool(r[4]),
    color: str(r[5]) || '7',
    active: bool(r[6], true),
    groupPrices: parseGroupPrices(r[7]),
  }),
  Students: (r: Cell[]): Student => normalizeStudentTypes({
    id: str(r[0]),
    name: str(r[1]),
    phone: str(r[2]),
    address: str(r[3]),
    buildingCode: str(r[4]),
    floorApt: str(r[5]),
    defaultLessonTypeId: str(r[6]),
    zoomLink: str(r[7]),
    notes: str(r[8]),
    active: bool(r[9], true),
    // Rows saved before this column existed migrate to allowed = [default].
    allowedLessonTypeIds: str(r[10]).split(',').map((x) => x.trim()).filter(Boolean),
    parentName: str(r[11]),
    parentPhone: str(r[12]),
    familyId: str(r[13]),
    paysMonthly: bool(r[14]),
  }),
  Payments: (r: Cell[]): Payment => ({
    id: str(r[0]),
    date: date(r[1]),
    payerId: str(r[2]),
    amount: num(r[3]),
    method: str(r[4]),
    notes: str(r[5]),
  }),
  Lessons: (r: Cell[]): Lesson => ({
    id: str(r[0]),
    date: date(r[1]),
    start: time(r[2]),
    end: time(r[3]),
    studentId: str(r[4]),
    studentName: str(r[5]),
    lessonTypeId: str(r[6]),
    price: num(r[7]),
    status: (['planned', 'done', 'cancelled', 'postponed'].includes(str(r[8])) ? str(r[8]) : 'planned') as LessonStatus,
    paid: bool(r[9]),
    calendarEventId: str(r[10]),
    notes: str(r[11]),
    units: Math.max(1, Math.round(num(r[12]))) || 1,
    calendarId: str(r[13]),
    seriesId: str(r[14]),
    seriesDate: r[15] === undefined || r[15] === '' ? '' : date(r[15]),
    dismissed: str(r[16]).split('|').filter(Boolean),
    groupId: str(r[17]),
  }),
  Series: (r: Cell[]): Series => ({
    id: str(r[0]),
    studentId: str(r[1]),
    weekday: Math.min(6, Math.max(0, Math.round(num(r[2])))),
    start: time(r[3]),
    lessonTypeId: str(r[4]),
    units: Math.max(1, Math.round(num(r[5]))) || 1,
    startDate: date(r[6]),
    endDate: str(r[7]) && str(r[7]) !== 'open' ? date(r[7]) : '',
    active: bool(r[8], true),
    unitPrice: num(r[9]),
    studentIds: (() => {
      const ids = str(r[10]).split(',').map((x) => x.trim()).filter(Boolean)
      return ids.length ? ids : [str(r[1])]
    })(),
  }),
}

export const toRow = {
  LessonTypes: (x: LessonType): Cell[] => [x.id, x.name, x.durationMin, x.price, x.isZoom, x.color, x.active, JSON.stringify(x.groupPrices)],
  Students: (x: Student): Cell[] => [
    x.id, x.name, x.phone, x.address, x.buildingCode, x.floorApt, x.defaultLessonTypeId, x.zoomLink, x.notes, x.active, x.allowedLessonTypeIds.join(','), x.parentName, x.parentPhone,
    x.familyId, x.paysMonthly,
  ],
  Payments: (x: Payment): Cell[] => [x.id, x.date, x.payerId, x.amount, x.method, x.notes],
  Lessons: (x: Lesson): Cell[] => [
    x.id, x.date, x.start, x.end, x.studentId, x.studentName, x.lessonTypeId, x.price, x.status, x.paid, x.calendarEventId, x.notes, x.units, x.calendarId,
    x.seriesId, x.seriesDate, x.dismissed.join('|'), x.groupId,
  ],
  Series: (x: Series): Cell[] => [
    x.id, x.studentId, x.weekday, x.start, x.lessonTypeId, x.units, x.startDate, x.endDate || 'open', x.active, x.unitPrice,
    x.studentIds.join(','),
  ],
}

const weekday = (start: string, end: string, on = true): DayHours => ({ on, ranges: [{ start, end }] })

export const DEFAULT_WORK_HOURS: DayHours[] = [
  weekday('15:00', '22:00'), // Sunday
  weekday('15:00', '22:00'),
  weekday('15:00', '22:00'),
  weekday('15:00', '22:00'),
  weekday('15:00', '22:00'), // Thursday
  weekday('09:00', '14:00'), // Friday
  { on: false, ranges: [] }, // Saturday
]

/** Keeps the default inside the allowed list (adds it, or picks the first allowed). */
export function normalizeStudentTypes(s: Student): Student {
  const allowed = [...new Set(s.allowedLessonTypeIds)]
  if (s.defaultLessonTypeId && !allowed.includes(s.defaultLessonTypeId)) allowed.unshift(s.defaultLessonTypeId)
  const def = s.defaultLessonTypeId || allowed[0] || ''
  return { ...s, allowedLessonTypeIds: allowed, defaultLessonTypeId: def }
}

/** No way to reach the student yet (added from the booking form and not completed). */
export const detailsMissing = (s: Student) => !s.phone && !s.parentPhone && !s.address && !s.zoomLink

export const DEFAULT_SETTINGS: Settings = {
  workHours: DEFAULT_WORK_HOURS,
  bufferMin: 15,
  calendarId: 'primary',
  calendarVisibility: {},
  highlightRules: [
    { id: 'hr_moked', keyword: 'מוקד', label: 'משמרת מוקד', color: '#ea580c', important: true, windowMin: 60, wholeWord: true },
  ],
  eventTitleVersion: 1,
  paymentMethods: ['מזומן', 'ביט', 'פייבוקס', 'העברה'],
  paymentsMigrated: false,
  sheetId: '',
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does the title contain the rule's keyword? Whole word allows Hebrew prefixes (ו ה ב ל מ ש כ). */
export function ruleMatches(title: string, r: HighlightRule) {
  const k = r.keyword.trim()
  if (!k) return false
  if (!r.wholeWord) return title.toLowerCase().includes(k.toLowerCase())
  return new RegExp(`(^|[^\\p{L}])[והבלמשכ]{0,2}${escapeRe(k)}(?=$|[^\\p{L}])`, 'iu').test(title)
}

/** First rule that matches the title. */
export function matchRule(title: string, rules: HighlightRule[]): HighlightRule | undefined {
  return rules.find((r) => ruleMatches(title, r))
}

/** Parses the workHours JSON; returns null if it is missing or malformed. */
function parseWorkHours(json: string | undefined): DayHours[] | null {
  if (!json) return null
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr) || arr.length !== 7) return null
    return arr.map((d) => ({
      on: !!d?.on,
      ranges: (Array.isArray(d?.ranges) ? d.ranges : [])
        .map((r: { start?: string; end?: string }) => ({ start: time(r?.start), end: time(r?.end) }))
        .filter((r: TimeRange) => r.start && r.end),
    }))
  } catch {
    return null
  }
}

/** Old format (workDays + one workStart–workEnd range for every day) → per-day hours. */
function migrateLegacyHours(kv: Map<string, string>): DayHours[] | null {
  if (!kv.has('workDays') && !kv.has('workStart') && !kv.has('workEnd')) return null
  const days = (kv.get('workDays') ?? '0,1,2,3,4')
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  const start = time(kv.get('workStart')) || '15:00'
  const end = time(kv.get('workEnd')) || '22:00'
  return Array.from({ length: 7 }, (_, d) => weekday(start, end, days.includes(d)))
}

export function settingsFromKv(kv: Map<string, string>): Settings {
  const s = { ...DEFAULT_SETTINGS }
  s.workHours = parseWorkHours(kv.get('workHours')) ?? migrateLegacyHours(kv) ?? DEFAULT_WORK_HOURS
  if (kv.has('bufferMin')) s.bufferMin = num(kv.get('bufferMin'))
  if (kv.get('calendarId')) s.calendarId = kv.get('calendarId')!
  try {
    const v = JSON.parse(kv.get('calendarVisibility') || '{}')
    if (v && typeof v === 'object' && !Array.isArray(v))
      s.calendarVisibility = Object.fromEntries(Object.entries(v).filter(([, b]) => typeof b === 'boolean')) as Record<string, boolean>
  } catch {
    /* keep default */
  }
  if (kv.has('highlightRules')) {
    try {
      const arr = JSON.parse(kv.get('highlightRules') || '[]')
      if (Array.isArray(arr))
        s.highlightRules = arr
          .filter((r) => r && typeof r.keyword === 'string')
          .map((r, i) => ({
            id: String(r.id || `hr_${i}`),
            keyword: String(r.keyword),
            label: String(r.label ?? ''),
            color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#ea580c',
            important: !!r.important,
            windowMin: Math.max(0, num(r.windowMin)),
            wholeWord: r.wholeWord !== false,
          }))
    } catch {
      /* keep default */
    }
  }
  if (kv.get('eventTitleVersion')) s.eventTitleVersion = num(kv.get('eventTitleVersion'))
  if (kv.has('paymentMethods')) {
    try {
      const m = JSON.parse(kv.get('paymentMethods') || '[]')
      if (Array.isArray(m)) s.paymentMethods = m.map((x) => String(x).trim()).filter(Boolean)
    } catch {
      /* keep default */
    }
  }
  if (kv.has('paymentsMigrated')) s.paymentsMigrated = bool(kv.get('paymentsMigrated'))
  if (kv.get('sheetId')) s.sheetId = kv.get('sheetId')!
  return s
}

/** Returns a Hebrew error for the day, or null if its ranges are valid. */
export function dayHoursError(d: DayHours): string | null {
  if (!d.on) return null
  if (!d.ranges.length) return 'יש להוסיף לפחות טווח שעות אחד.'
  const sorted = [...d.ranges].sort((a, b) => a.start.localeCompare(b.start))
  for (let i = 0; i < sorted.length; i++) {
    if (!sorted[i].start || !sorted[i].end) return 'יש למלא שעת התחלה וסיום.'
    if (sorted[i].start >= sorted[i].end) return 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.'
    if (i > 0 && sorted[i].start < sorted[i - 1].end) return 'יש טווחים חופפים.'
  }
  return null
}

export function settingsToKv(s: Settings): [string, string][] {
  return [
    ['workHours', JSON.stringify(s.workHours)],
    ['bufferMin', String(s.bufferMin)],
    ['calendarId', s.calendarId],
    ['calendarVisibility', JSON.stringify(s.calendarVisibility)],
    ['highlightRules', JSON.stringify(s.highlightRules)],
    ['eventTitleVersion', String(s.eventTitleVersion)],
    ['paymentMethods', JSON.stringify(s.paymentMethods)],
    ['paymentsMigrated', String(s.paymentsMigrated)],
    ['sheetId', s.sheetId],
  ]
}

export const SEED_LESSON_TYPES: LessonType[] = [
  { id: 'lt_front45', name: 'פרונטלי 45׳', durationMin: 45, price: 130, isZoom: false, color: '10', active: true, groupPrices: {} },
  { id: 'lt_front150', name: 'פרונטלי 150', durationMin: 45, price: 150, isZoom: false, color: '9', active: true, groupPrices: {} },
  { id: 'lt_zoom120', name: 'זום 120', durationMin: 45, price: 120, isZoom: true, color: '5', active: true, groupPrices: {} },
  { id: 'lt_zoom100', name: 'זום 100', durationMin: 45, price: 100, isZoom: true, color: '6', active: true, groupPrices: {} },
]

/** Google Calendar event colors (colorId → name, hex). */
export const EVENT_COLORS: Record<string, { name: string; hex: string }> = {
  '1': { name: 'לבנדר', hex: '#7986cb' },
  '2': { name: 'מרווה', hex: '#33b679' },
  '3': { name: 'ענב', hex: '#8e24aa' },
  '4': { name: 'פלמינגו', hex: '#e67c73' },
  '5': { name: 'בננה', hex: '#f6bf26' },
  '6': { name: 'מנדרינה', hex: '#f4511e' },
  '7': { name: 'טווס', hex: '#039be5' },
  '8': { name: 'גרפיט', hex: '#616161' },
  '9': { name: 'אוכמנית', hex: '#3f51b5' },
  '10': { name: 'בזיליקום', hex: '#0b8043' },
  '11': { name: 'עגבנייה', hex: '#d50000' },
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
}
