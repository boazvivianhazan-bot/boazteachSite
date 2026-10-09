// Free-slot math. Pure functions over [start, end) intervals in minutes since
// midnight, so they are easy to test and reason about. No imports on purpose.

export type Iv = [number, number]

export function mergeIntervals(ivs: Iv[]): Iv[] {
  const sorted = ivs.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0])
  const out: Iv[] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

/** windows minus cuts */
export function subtract(windows: Iv[], cuts: Iv[]): Iv[] {
  const merged = mergeIntervals(cuts)
  const out: Iv[] = []
  for (const [ws, we] of mergeIntervals(windows)) {
    let cur = ws
    for (const [cs, ce] of merged) {
      if (ce <= cur || cs >= we) continue
      if (cs > cur) out.push([cur, cs])
      cur = Math.max(cur, ce)
      if (cur >= we) break
    }
    if (cur < we) out.push([cur, we])
  }
  return out
}

/**
 * Free time inside the work windows: busy events are widened by the break
 * on both sides, and nothing before `notBefore` (e.g. "now" for today).
 */
export function freeIntervals(windows: Iv[], busy: Iv[], bufferMin: number, notBefore = 0): Iv[] {
  const cuts: Iv[] = busy.map(([s, e]) => [s - bufferMin, e + bufferMin])
  if (notBefore > 0) cuts.push([-1, notBefore])
  return subtract(windows, cuts)
}

/**
 * Bookable lessons of `len` minutes inside the free intervals. Starts are
 * snapped up to `snap` minutes; consecutive slots keep the break between them.
 */
export function slotsIn(free: Iv[], len: number, bufferMin: number, snap = 5): Iv[] {
  const out: Iv[] = []
  for (const [s, e] of free) {
    for (let t = Math.ceil(s / snap) * snap; t + len <= e; t += len + bufferMin) out.push([t, t + len])
  }
  return out
}

/** Free intervals (snapped) that can fit at least one lesson — used for the WhatsApp text. */
export function fittingIntervals(free: Iv[], len: number, snap = 5): Iv[] {
  return free
    .map(([s, e]): Iv => [Math.ceil(s / snap) * snap, e])
    .filter(([s, e]) => e - s >= len)
}
