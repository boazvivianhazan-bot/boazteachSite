// Minimal typings + loader for Google Identity Services (token model).
import { GOOGLE_CLIENT_ID, SCOPES } from '../config'

interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(cfg: {
    client_id: string
    scope: string
    callback: (r: TokenResponse) => void
    error_callback?: (e: { type: string; message?: string }) => void
  }): TokenClient
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } }
  }
}

let loading: Promise<void> | null = null

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('לא ניתן לטעון את רכיב ההתחברות של גוגל. בדוק חיבור לאינטרנט.'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export function isClientIdConfigured() {
  return !GOOGLE_CLIENT_ID.startsWith('PASTE_')
}

/** Opens the Google popup and resolves with a token (must be called from a click). */
export async function requestToken(prompt: '' | 'consent'): Promise<TokenResponse> {
  await loadGis()
  const oauth2 = window.google!.accounts.oauth2
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES.join(' '),
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error))
        if (!oauth2.hasGrantedAllScopes(r, ...SCOPES)) {
          return reject(new Error('יש לאשר את כל ההרשאות (יומן, גיליונות, דרייב) כדי שהאפליקציה תעבוד.'))
        }
        resolve(r)
      },
      error_callback: (e) => {
        reject(new Error(e.type === 'popup_closed' ? 'חלון ההתחברות נסגר.' : 'ההתחברות נכשלה.'))
      },
    })
    client.requestAccessToken({ prompt })
  })
}

export function revokeToken(token: string) {
  window.google?.accounts.oauth2.revoke(token)
}
