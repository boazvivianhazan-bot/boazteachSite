// Access token lives in memory, mirrored to sessionStorage so a page reload
// inside the same tab does not force a new login. It is not personal data and
// it disappears when the tab/app is closed.
const KEY = 'gat'

export type TokenState = 'none' | 'valid' | 'expired'

let accessToken: string | null = null
let expiresAt = 0
let expiredFlag = false
const listeners = new Set<() => void>()

try {
  const raw = sessionStorage.getItem(KEY)
  if (raw) {
    const t = JSON.parse(raw) as { accessToken: string; expiresAt: number }
    if (t.expiresAt > Date.now() + 60_000) {
      accessToken = t.accessToken
      expiresAt = t.expiresAt
    }
  }
} catch {
  /* storage unavailable */
}

function emit() {
  listeners.forEach((l) => l())
}

export const tokenStore = {
  get(): string | null {
    return expiredFlag ? null : accessToken
  },
  state(): TokenState {
    if (!accessToken) return 'none'
    if (expiredFlag || Date.now() >= expiresAt) return 'expired'
    return 'valid'
  },
  expiresAt: () => expiresAt,
  set(token: string, expiresInSec: number) {
    accessToken = token
    // Treat the token as expired a minute early to avoid racing the server.
    expiresAt = Date.now() + (expiresInSec - 60) * 1000
    expiredFlag = false
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ accessToken, expiresAt }))
    } catch {
      /* ignore */
    }
    emit()
  },
  markExpired() {
    if (!accessToken || expiredFlag) return
    expiredFlag = true
    emit()
  },
  clear() {
    accessToken = null
    expiresAt = 0
    expiredFlag = false
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    emit()
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}
