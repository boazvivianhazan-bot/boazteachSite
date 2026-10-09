// Side-by-side columns for overlapping events, like Google Calendar: items that
// overlap (directly or through a chain) form a cluster; each gets the first
// free column, and every item in a cluster shares the cluster's column count.

export interface Span {
  key: string
  start: number
  end: number
}

export interface Placement {
  col: number
  cols: number
}

/** `minLen`: an item is laid out at least this long (it is drawn with a minimum height). */
export function layoutColumns(items: Span[], minLen = 0): Map<string, Placement> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out = new Map<string, Placement>()
  let cluster: { key: string; col: number }[] = []
  let colEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    for (const c of cluster) out.set(c.key, { col: c.col, cols: colEnds.length })
    cluster = []
    colEnds = []
  }

  for (const it of sorted) {
    const visEnd = Math.max(it.end, it.start + minLen)
    if (it.start >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    let col = colEnds.findIndex((end) => end <= it.start)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(visEnd)
    } else colEnds[col] = visEnd
    cluster.push({ key: it.key, col })
    clusterEnd = Math.max(clusterEnd, visEnd)
  }
  flush()
  return out
}
