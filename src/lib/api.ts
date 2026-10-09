import { tokenStore } from '../auth/tokenStore'

export class AuthExpiredError extends Error {
  constructor() {
    super('החיבור לגוגל פג. יש להתחבר מחדש.')
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** fetch() against a Google API with the current access token. */
export async function gfetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get()
  if (!token || tokenStore.state() !== 'valid') {
    tokenStore.markExpired()
    throw new AuthExpiredError()
  }
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'אין חיבור לאינטרנט או שהשרת לא זמין.')
  }
  if (res.status === 401) {
    tokenStore.markExpired()
    throw new AuthExpiredError()
  }
  if (!res.ok) {
    let msg = `שגיאה ${res.status}`
    try {
      const body = await res.json()
      if (body?.error?.message) msg += `: ${body.error.message}`
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message
  return 'אירעה שגיאה לא צפויה.'
}
