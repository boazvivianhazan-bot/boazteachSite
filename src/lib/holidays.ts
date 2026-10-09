// Israeli holidays (days off) and holiday eves, for the conflict check.
// Source: Google's public Jewish holidays calendar (English titles, matched
// against a fixed list); Hebcal only as a fallback if Google can't be read.
import { listEvents } from './calendar'
import { addDays, zonedToUtc } from './tz'

export interface HolidayDay {
  kind: 'holiday' | 'eve' // eve = conflict from 13:00
  name: string // Hebrew
}

export interface Holidays {
  source: 'Google' | 'Hebcal'
  days: Record<string, HolidayDay>
}

export const EVE_FROM_MIN = 13 * 60

// The English-prefixed id returns English titles, so matching doesn't depend on the account language.
const GOOGLE_HOLIDAYS = 'en.jewish#holiday@group.v.calendar.google.com'

// Days off in Israel (Chol HaMoed, Hanukkah etc. are deliberately not here).
// Patterns also tolerate the outside-Israel version of the calendar.
const RULES: { re: RegExp; kind: HolidayDay['kind']; name: string }[] = [
  { re: /^Rosh Hashana Eve$/i, kind: 'eve', name: 'ערב ראש השנה' },
  { re: /^Rosh Hashana( \(Day 2\))?$/i, kind: 'holiday', name: 'ראש השנה' },
  { re: /^Yom Kippur Eve$/i, kind: 'eve', name: 'ערב יום כיפור' },
  { re: /^Yom Kippur$/i, kind: 'holiday', name: 'יום כיפור' },
  { re: /^Sukkot Eve$/i, kind: 'eve', name: 'ערב סוכות' },
  { re: /^Sukkot \(Day 1\)$/i, kind: 'holiday', name: 'סוכות' },
  { re: /Hoshana?h? Rabb?ah?/i, kind: 'eve', name: 'הושענא רבה (ערב שמחת תורה)' },
  { re: /^Shemini Atzeret/i, kind: 'holiday', name: 'שמחת תורה' },
  { re: /^Passover Eve$/i, kind: 'eve', name: 'ערב פסח' },
  { re: /^Passover \(Day 1\)$/i, kind: 'holiday', name: 'פסח' },
  { re: /^Passover \(Day 6\)$/i, kind: 'eve', name: 'ערב שביעי של פסח' },
  { re: /^Passover \(Day 7\)$/i, kind: 'holiday', name: 'שביעי של פסח' },
  { re: /^Shavuot Eve$/i, kind: 'eve', name: 'ערב שבועות' },
  { re: /^Shavuot( \(Day 1\))?$/i, kind: 'holiday', name: 'שבועות' },
  { re: /^Yom HaZikaron$/i, kind: 'eve', name: 'יום הזיכרון (ערב יום העצמאות)' },
  { re: /^Yom HaAtzmaut$/i, kind: 'holiday', name: 'יום העצמאות' },
]

/** Exported for tests: classify a Google holiday title. */
export function classifyGoogleTitle(title: string): HolidayDay | null {
  const r = RULES.find((x) => x.re.test(title.trim()))
  return r ? { kind: r.kind, name: r.name } : null
}

function put(days: Record<string, HolidayDay>, iso: string, h: HolidayDay) {
  // A day off beats an eve on the same date (e.g. Sukkot Day 7 is also Hoshana Rabba).
  if (!days[iso] || (days[iso].kind === 'eve' && h.kind === 'holiday')) days[iso] = h
}

async function fromGoogle(from: string, to: string): Promise<Holidays> {
  const events = await listEvents(GOOGLE_HOLIDAYS, zonedToUtc(from, 0), zonedToUtc(addDays(to, 1), 0))
  const days: Record<string, HolidayDay> = {}
  for (const e of events) {
    const iso = e.start.date ?? e.start.dateTime?.slice(0, 10)
    const h = iso && classifyGoogleTitle(e.summary ?? '')
    if (iso && h) put(days, iso, h)
  }
  return { source: 'Google', days }
}

async function fromHebcal(from: string, to: string): Promise<Holidays> {
  // Sends only the date range — no personal data.
  const qs = new URLSearchParams({
    v: '1', cfg: 'json', maj: 'on', min: 'off', mod: 'on', nx: 'off', mf: 'off', ss: 'off', s: 'off', c: 'off',
    i: 'on', lg: 'he', start: from, end: to,
  })
  const r = await fetch(`https://www.hebcal.com/hebcal?${qs}`)
  if (!r.ok) throw new Error(`Hebcal ${r.status}`)
  const body = (await r.json()) as { items?: { title: string; date: string; yomtov?: boolean; subcat?: string }[] }
  const days: Record<string, HolidayDay> = {}
  for (const it of body.items ?? []) {
    const iso = it.date.slice(0, 10)
    if (it.title.startsWith('ערב')) put(days, iso, { kind: 'eve', name: it.title })
    else if (it.yomtov || /יום העצמאות/.test(it.title)) put(days, iso, { kind: 'holiday', name: it.title })
    else if (/יום הזיכרון/.test(it.title)) put(days, iso, { kind: 'eve', name: it.title })
  }
  return { source: 'Hebcal', days }
}

const cache = new Map<string, Promise<Holidays>>()

export function getHolidays(from: string, to: string): Promise<Holidays> {
  const key = `${from}|${to}`
  let p = cache.get(key)
  if (!p) {
    p = fromGoogle(from, to).catch(() => fromHebcal(from, to))
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
