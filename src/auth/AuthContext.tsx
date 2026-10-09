import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { tokenStore, type TokenState } from './tokenStore'
import { loadGis, requestToken, revokeToken } from './gis'

// Non-personal flag: lets later logins skip the consent screen.
const CONSENTED_KEY = 'gconsented'

interface AuthCtx {
  state: TokenState
  busy: boolean
  error: string | null
  signIn: () => Promise<void>
  signOut: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

function readConsented() {
  try {
    return localStorage.getItem(CONSENTED_KEY) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(tokenStore.subscribe, tokenStore.state)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preload the GIS script so the popup opens instantly on tap.
  useEffect(() => {
    loadGis().catch(() => {})
  }, [])

  // Flip to "expired" when the token's lifetime runs out.
  useEffect(() => {
    if (state !== 'valid') return
    const ms = tokenStore.expiresAt() - Date.now()
    const t = setTimeout(() => tokenStore.markExpired(), Math.max(0, ms))
    return () => clearTimeout(t)
  }, [state])

  const signIn = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await requestToken(readConsented() ? '' : 'consent')
      tokenStore.set(r.access_token, r.expires_in)
      try {
        localStorage.setItem(CONSENTED_KEY, '1')
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההתחברות נכשלה.')
    } finally {
      setBusy(false)
    }
  }, [])

  const signOut = useCallback(() => {
    const t = tokenStore.get()
    if (t) revokeToken(t)
    tokenStore.clear()
    try {
      localStorage.removeItem(CONSENTED_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return <Ctx.Provider value={{ state, busy, error, signIn, signOut }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
