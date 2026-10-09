import { useAuth } from '../auth/AuthContext'
import { Button } from './ui'

/**
 * Shown on top of the app when the token expires. The app underneath stays
 * mounted, so anything typed into a form is kept while re-logging in.
 */
export function ReloginBanner() {
  const { state, signIn, busy, error } = useAuth()
  if (state !== 'expired') return null
  return (
    <div className="pt-safe fixed inset-x-0 top-0 z-50 border-b border-amber-300 bg-amber-50 shadow-md">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 p-3">
        <p className="flex-1 text-sm text-amber-900">
          החיבור לגוגל פג. הנתונים שהזנת נשמרו — התחבר מחדש כדי להמשיך.
          {error && <span className="block text-red-700">{error}</span>}
        </p>
        <Button onClick={signIn} disabled={busy}>
          {busy ? 'מתחבר…' : 'התחבר מחדש'}
        </Button>
      </div>
    </div>
  )
}
