import { useAuth } from '../auth/AuthContext'
import { isClientIdConfigured } from '../auth/gis'
import { Button, ErrorBox } from './ui'
import { CalendarIcon } from './icons'

export function LoginScreen() {
  const { signIn, busy, error } = useAuth()
  const configured = isClientIdConfigured()

  return (
    <div className="pt-safe flex min-h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-3xl bg-brand-700 text-white shadow-lg">
        <CalendarIcon width={40} height={40} />
      </div>
      <div>
        <h1 className="text-2xl font-bold">ניהול שיעורים פרטיים</h1>
        <p className="mt-2 text-gray-600">יומן, תלמידים וסיכומים — מחובר לחשבון הגוגל שלך.</p>
      </div>

      {!configured ? (
        <ErrorBox message="חסר Client ID. יש להדביק אותו בקובץ src/config.ts (ראה README)." />
      ) : (
        <Button onClick={signIn} disabled={busy} className="w-full max-w-xs text-lg">
          {busy ? 'מתחבר…' : 'התחברות עם Google'}
        </Button>
      )}
      {error && <ErrorBox message={error} />}
    </div>
  )
}
