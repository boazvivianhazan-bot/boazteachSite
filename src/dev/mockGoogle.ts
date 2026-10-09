// DEV ONLY (http://localhost:5173/?mock): fakes the Google APIs in memory so
// the UI can be exercised without a real account. Never bundled in production.
import { tokenStore } from '../auth/tokenStore'
import { addDays, utcToZoned, weekdayOf, weekStartOf, zonedToUtc } from '../lib/tz'

type Cell = string | number | boolean
const sheets: Record<string, Record<string, Cell[][]>> = {}
const files: { id: string; name: string }[] = []
const demoLessons: { id: string; iso: string; s: number; e: number; title: string }[] = [] // calendar events of the demo lessons
const calendars = [
  { id: 'me@example.com', summary: 'היומן שלי', primary: true, selected: true, accessRole: 'owner', backgroundColor: '#039be5' },
  { id: 'work@group.calendar.google.com', summary: 'עבודה', selected: true, accessRole: 'owner', backgroundColor: '#e67c73' },
  { id: 'he.jewish#holiday@group.v.calendar.google.com', summary: 'חגים בישראל', selected: true, accessRole: 'reader', backgroundColor: '#0b8043' },
  { id: 'family@group.calendar.google.com', summary: 'משפחה (מוסתר)', selected: false, accessRole: 'writer', backgroundColor: '#8e24aa' },
]

type FakeEvent = Record<string, unknown>
const nextSunday = () => addDays(weekStartOf(utcToZoned(new Date()).iso), 7)
/** Events created through the app (POST), per calendar. */
const created: Record<string, FakeEvent[]> = {}
const calKey = (id: string) => (id === 'primary' ? 'me@example.com' : id)

/**
 * Deterministic fake events per calendar, repeating weekly:
 *  me:      Sun/Tue/Thu 17:00–18:00 yoga · Mon 15:50–16:00 phone call (short) · Mon 19:30–20:10 dentist (HTML description)
 *           Wed 23:00–01:00 party (crosses midnight) · demo lessons
 *  work:    Sun 17:30–18:30 meeting (overlaps yoga) · Thu 08:00–09:00 early meeting (outside work hours)
 *  holiday: Tue all-day (free) · Thu–Fri all-day conference marked busy
 *  family:  Wed 16:00–17:00 (calendar hidden by default)
 */
function fakeEvents(calId: string, timeMin: string, timeMax: string): FakeEvent[] {
  const out: FakeEvent[] = []
  const timed = (id: string, iso: string, s: number, e: number, summary: string, extra: FakeEvent = {}) =>
    out.push({ id: `${id}_${iso}`, summary, start: { dateTime: zonedToUtc(iso, s).toISOString() }, end: { dateTime: zonedToUtc(iso, e).toISOString() }, ...extra })
  const allDay = (id: string, iso: string, days: number, summary: string, extra: FakeEvent = {}) =>
    out.push({ id: `${id}_${iso}`, summary, start: { date: iso }, end: { date: addDays(iso, days) }, ...extra })
  const first = utcToZoned(new Date(timeMin)).iso
  const last = utcToZoned(new Date(timeMax)).iso
  for (const ev of created[calKey(calId)] ?? []) {
    const s = (ev.start as { dateTime: string }).dateTime
    if (s >= timeMin && s < timeMax) out.push(ev)
  }
  if (calId === 'me@example.com')
    for (const l of demoLessons) if (l.iso >= first && l.iso < last) out.push({ id: l.id, summary: l.title, start: { dateTime: zonedToUtc(l.iso, l.s).toISOString() }, end: { dateTime: zonedToUtc(l.iso, l.e).toISOString() } })
  for (let iso = first; iso < last; iso = addDays(iso, 1)) {
    const wd = weekdayOf(iso)
    if (calId === 'me@example.com') {
      if (wd === 0 || wd === 2 || wd === 4) timed('yoga', iso, 17 * 60, 18 * 60, 'חוג יוגה', { location: 'סטודיו גוף ונפש, דיזנגוף 100' })
      if (wd === 1) timed('call', iso, 15 * 60 + 50, 16 * 60, 'שיחת טלפון')
      if (wd === 1) timed('dent', iso, 19 * 60 + 30, 20 * 60 + 10, 'רופא שיניים', { description: '<b>להביא</b> טופס התחייבות<br>פרטים: https://example.com/clinic' })
      if (wd === 3) timed('party', iso, 23 * 60, 25 * 60, 'מסיבה')
    }
    if (calId === 'work@group.calendar.google.com') {
      if (wd === 0) timed('meet', iso, 17 * 60 + 30, 18 * 60 + 30, 'ישיבת צוות')
      if (wd === 4) timed('early', iso, 8 * 60, 9 * 60, 'פגישה מוקדמת')
      if (wd === 3) timed('moked', iso, 18 * 60, 22 * 60, 'משמרת מוקד ערב')
    }
    if (calId === 'he.jewish#holiday@group.v.calendar.google.com') {
      if (wd === 2) allDay('hol', iso, 1, 'יום מיוחד (פנוי)', { transparency: 'transparent' })
      if (wd === 4) allDay('conf', iso, 2, 'כנס (תפוס)')
    }
    if (calId === 'family@group.calendar.google.com' && wd === 3) timed('fam', iso, 16 * 60, 17 * 60, 'ארוחה משפחתית')
    // Google's English Jewish-holidays calendar: next week's Wednesday = Sukkot Eve, Thursday = Sukkot (Day 1), plus a non-day-off.
    if (calId === 'en.jewish#holiday@group.v.calendar.google.com' && iso >= nextSunday() && iso < addDays(nextSunday(), 7)) {
      if (wd === 3) allDay('h_eve', iso, 1, 'Sukkot Eve')
      if (wd === 4) allDay('h_day', iso, 1, 'Sukkot (Day 1)')
      if (wd === 5) allDay('h_cm', iso, 1, 'Sukkot (Day 2)')
    }
  }
  return out
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function colToIdx(col: string) {
  return col.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
}

function writeRange(id: string, range: string, values: (Cell | null)[][]) {
  const [tab, a1] = range.split('!')
  const m = a1.match(/^([A-Z]+)(\d+)/)!
  const c0 = colToIdx(m[1])
  const r0 = Number(m[2]) - 1
  const grid = (sheets[id][tab] ??= [])
  values.forEach((row: (Cell | null)[], i) => {
    const target = (grid[r0 + i] ??= [])
    row.forEach((v, j) => {
      if (v !== null) target[c0 + j] = v // null = leave the cell unchanged (as in Sheets)
    })
  })
  for (let i = 0; i < grid.length; i++) grid[i] ??= []
}

export function installMockGoogle() {
  tokenStore.set('mock-token', 3600)
  // ?mock=legacy → start from a sheet saved in the old single-range format.
  if (new URLSearchParams(location.search).get('mock') === 'legacy') {
    sheets.legacy = {
      LessonTypes: [
        ['id', 'name', 'durationMin', 'price', 'isZoom', 'color', 'active'],
        ['lt_a', 'פרונטלי 45׳', 45, 130, false, '10', true],
        ['lt_z', 'זום 120', 45, 120, true, '5', true],
      ],
      Students: [
        ['id', 'name', 'phone', 'address', 'buildingCode', 'floorApt', 'defaultLessonTypeId', 'zoomLink', 'notes', 'active'],
        ['st_old', 'תלמיד ישן', '0501111111', 'רחוב 1', '', '', 'lt_a', '', '', true],
      ],
      Lessons: [['id']],
      Settings: [['key', 'value'], ['workDays', '0,1,2,3'], ['workStart', '14:00'], ['workEnd', '20:30'], ['bufferMin', '10'], ['calendarId', 'primary'], ['sheetId', 'legacy']],
    }
    files.push({ id: 'legacy', name: 'Lessons DB' })
  }
  // ?mock=demo → sample students and lessons next week (sisters at one address, a Zoom student).
  const mode = new URLSearchParams(location.search).get('mock')
  if (mode === 'demo' || mode === 'messy') {
    const sun = addDays(weekStartOf(utcToZoned(new Date()).iso), 7)
    const tue = addDays(sun, 2)
    sheets.demo = {
      LessonTypes: [
        ['id', 'name', 'durationMin', 'price', 'isZoom', 'color', 'active'],
        ['lt_front45', 'פרונטלי 45׳', 45, 130, false, '10', true],
        ['lt_zoom120', 'זום 120', 45, 120, true, '5', true],
      ],
      Students: [
        ['id', 'name', 'phone', 'address', 'buildingCode', 'floorApt', 'defaultLessonTypeId', 'zoomLink', 'notes', 'active', 'allowedLessonTypeIds', 'parentName', 'parentPhone'],
        ['st_dana', 'דנה כהן', '0501111111', 'הרצל 1, תל אביב', '1234', '3/7', 'lt_front45', '', '', true, 'lt_front45'],
        ['st_noa', 'נועה כהן', '0502222222', 'הרצל 1, תל אביב', '1234', '3/7', 'lt_front45', '', '', true, 'lt_front45'],
        ['st_yossi', 'יוסי לוי', '0503333333', 'ביאליק 5, רמת גן', '', '', 'lt_zoom120', 'https://zoom.us/j/1', '', true, 'lt_zoom120,lt_front45', 'רונית לוי', '0527777777'],
      ],
      Lessons: [
        ['id', 'date', 'start', 'end', 'studentId', 'studentName', 'lessonTypeId', 'price', 'status', 'paid', 'calendarEventId', 'notes', 'units', 'calendarId', 'seriesId', 'seriesDate', 'dismissed'],
        ['ls_1', sun, '15:00', '15:45', 'st_dana', 'דנה כהן', 'lt_front45', 130, 'planned', false, 'ev1', ''],
        // app-created events in the OLD title format (one future, one past) — for the one-time title fix
        ['ls_old1', addDays(sun, 1), '15:00', '15:45', 'st_yossi', 'יוסי לוי', 'lt_zoom120', 120, 'planned', false, 'app_old1', '', 1, 'primary', '', '', ''],
        ['ls_old2', addDays(sun, -6), '12:00', '12:45', 'st_dana', 'דנה כהן', 'lt_front45', 130, 'done', true, 'app_old2', '', 1, 'primary', '', '', ''],
        ['ls_2', tue, '19:00', '19:45', 'st_yossi', 'יוסי לוי', 'lt_zoom120', 120, 'planned', false, 'ev2', '', 1, '', 'sr_aaaa1111', tue, ''],
        // Wednesday 17:00 — 15 minutes before "משמרת מוקד ערב" (18:00) and on Sukkot Eve after 13:00
        ['ls_3', addDays(sun, 3), '17:00', '17:45', 'st_dana', 'דנה כהן', 'lt_front45', 130, 'planned', false, '', ''],
        // Thursday — Sukkot (day off)
        ['ls_4', addDays(sun, 4), '16:00', '16:45', 'st_noa', 'נועה כהן', 'lt_front45', 130, 'planned', false, '', ''],
        // Friday — Sukkot Day 2 is Chol HaMoed: not a conflict
        ['ls_5', addDays(sun, 5), '10:00', '10:45', 'st_noa', 'נועה כהן', 'lt_front45', 130, 'planned', false, '', ''],
      ],
      // (past lessons for the monthly summary are appended below)
      Series: [
        ['seriesId', 'studentId', 'weekday', 'start', 'lessonTypeId', 'units', 'startDate', 'endDate', 'active', 'price'],
        ['sr_aaaa1111', 'st_yossi', 2, '19:00', 'lt_zoom120', 1, tue, 'open', true, 120],
      ],
      Settings: [['key', 'value'], ['bufferMin', '15'], ['calendarId', 'primary'], ['sheetId', 'demo']],
    }
    files.push({ id: 'demo', name: 'Lessons DB' })
    const oldEv = (id: string, iso: string, s: number, title: string) => ({
      id, summary: title, location: '', description: '',
      start: { dateTime: zonedToUtc(iso, s).toISOString() }, end: { dateTime: zonedToUtc(iso, s + 45).toISOString() },
      extendedProperties: { private: { lessonsApp: '1' } },
    })
    created['me@example.com'] = [oldEv('app_old1', addDays(sun, 1), 15 * 60, 'שיעור – יוסי לוי'), oldEv('app_old2', addDays(sun, -6), 12 * 60, 'שיעור – דנה כהן')]
    // Past lessons for the monthly summary: this month and the two before.
    const today = utcToZoned(new Date()).iso
    const past = (days: number, start: string, end: string, st: string, name: string, lt: string, price: number, status: string, paid: boolean, units = 1) =>
      sheets.demo.Lessons.push([`ls_p${days}`, addDays(today, -days), start, end, st, name, lt, price, status, paid, '', '', units, '', '', '', ''])
    past(1, '16:00', '16:45', 'st_dana', 'דנה כהן', 'lt_front45', 130, 'planned', false) // passed, still planned
    past(2, '17:00', '18:30', 'st_yossi', 'יוסי לוי', 'lt_zoom120', 240, 'done', false, 2) // ×2, unpaid
    past(3, '15:00', '15:45', 'st_noa', 'נועה כהן', 'lt_front45', 130, 'done', true)
    past(4, '15:00', '15:45', 'st_dana', 'דנה כהן', 'lt_front45', 130, 'cancelled', false)
    past(6, '18:00', '18:45', 'st_yossi', 'יוסי לוי', 'lt_zoom120', 120, 'done', true)
    past(35, '16:00', '16:45', 'st_dana', 'דנה כהן', 'lt_front45', 130, 'done', true)
    past(40, '16:00', '16:45', 'st_noa', 'נועה כהן', 'lt_front45', 120, 'done', true)
    past(70, '16:00', '16:45', 'st_dana', 'דנה כהן', 'lt_front45', 125, 'done', true)
    if (mode === 'messy') {
      // Hand-edit damage: cleared rows in the middle, a row typed without an id,
      // a copy-pasted duplicate, and the Students columns reordered (phone ⇄ address).
      const L = sheets.demo.Lessons
      L.splice(2, 0, [], ['', '', '', ''])
      L.push(['', sun, '18:00', '18:45', 'st_noa', 'נועה כהן', 'lt_front45', 130, 'planned', false, '', 'הוקלד ידנית'])
      L.push([...L[4]])
      for (const r of sheets.demo.Students) [r[2], r[3]] = [r[3], r[2]]
    }
    demoLessons.push(
      { id: 'ev1', iso: sun, s: 15 * 60, e: 15 * 60 + 45, title: 'שיעור – דנה כהן' },
      { id: 'ev2', iso: tue, s: 19 * 60, e: 19 * 60 + 45, title: 'שיעור – יוסי לוי' },
    )
  }
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : null
    await new Promise((r) => setTimeout(r, 150))
    console.debug('[mock]', method, url.pathname, body ?? '')

    if (url.host === 'www.googleapis.com' && url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? ''
      return json({ files: files.filter((f) => q.includes(`name='${f.name}'`)).map((f) => ({ id: f.id })) })
    }
    const evMatch = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/)
    if (evMatch) {
      const calId = calKey(decodeURIComponent(evMatch[1]))
      const evId = evMatch[2] && decodeURIComponent(evMatch[2])
      const list = (created[calId] ??= [])
      if (!evId && method === 'GET')
        return json({ items: fakeEvents(calId, url.searchParams.get('timeMin')!, url.searchParams.get('timeMax')!) })
      if (!evId && method === 'POST') {
        if (body.id && list.some((e) => e.id === body.id)) return json({ error: { message: 'The requested identifier already exists.' } }, 409)
        const ev = { ...body, id: body.id ?? `app_${Math.random().toString(36).slice(2, 10)}` }
        list.push(ev)
        return json(ev)
      }
      const i = list.findIndex((e) => e.id === evId)
      if (i < 0) {
        // Generated events (yoga, dentist, demo lessons…) exist but carry no app marker.
        if (method === 'GET' && evId && !evId.startsWith('app_') && !evId.startsWith('lsn')) return json({ id: evId, status: 'confirmed' })
        return json({ error: { message: 'Not Found' } }, 404)
      }
      if (method === 'GET') return json(list[i])
      if (method === 'PATCH') {
        list[i] = { ...list[i], ...body }
        return json(list[i])
      }
      if (method === 'DELETE') {
        list.splice(i, 1)
        return new Response(null, { status: 204 })
      }
    }
    if (url.pathname.startsWith('/calendar/v3/users/me/calendarList')) {
      if (url.pathname.endsWith('/primary')) return json(calendars[0])
      return json({ items: calendars })
    }
    if (url.host === 'sheets.googleapis.com') {
      const path = url.pathname.replace('/v4/spreadsheets', '')
      if (path === '' && method === 'POST') {
        const id = `mock_${Math.random().toString(36).slice(2, 8)}`
        sheets[id] = {}
        files.push({ id, name: body.properties.title })
        for (const sh of body.sheets) {
          const rows = (sh.data?.[0]?.rowData ?? []).map((r: { values: { userEnteredValue: Record<string, Cell> }[] }) =>
            r.values.map((c) => Object.values(c.userEnteredValue)[0]),
          )
          sheets[id][sh.properties.title] = rows
        }
        return json({ spreadsheetId: id })
      }
      const [, id, rest = ''] = path.match(/^\/([^/:]+)(.*)$/) ?? []
      if (!sheets[id]) return json({ error: { message: 'Requested entity was not found.' } }, 404)
      const titles = Object.keys(sheets[id])
      if (rest === '' && method === 'GET') return json({ sheets: titles.map((title, sheetId) => ({ properties: { title, sheetId } })) })
      if (rest === ':batchUpdate') {
        for (const r of body.requests) {
          if (r.addSheet) sheets[id][r.addSheet.properties.title] = []
          if (r.deleteDimension) {
            const { sheetId, startIndex, endIndex } = r.deleteDimension.range
            sheets[id][titles[sheetId]].splice(startIndex, endIndex - startIndex)
          }
        }
        return json({})
      }
      if (rest === '/values:batchGet') {
        return json({ valueRanges: url.searchParams.getAll('ranges').map((r) => ({ values: sheets[id][r.split('!')[0]] ?? [] })) })
      }
      if (rest === '/values:batchUpdate') {
        for (const d of body.data) writeRange(id, d.range, d.values)
        return json({})
      }
    }
    return realFetch(input, init)
  }
  ;(window as unknown as { mockSheets: unknown; mockEvents: unknown }).mockSheets = sheets
  ;(window as unknown as { mockEvents: unknown }).mockEvents = created
}
