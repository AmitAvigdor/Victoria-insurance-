import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldCheck, LogIn, Mail } from 'lucide-react'
import { useAuth } from '@/app/auth'
import { demoEnabled, isConfigured, supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils'
import { Brand, BrandSignature } from '@/components/Brand'
export function Login() {
  const auth = useAuth()
  const location = useLocation()
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const returnTo =
    typeof location.state?.from === 'string' &&
    location.state.from.startsWith('/') &&
    !location.state.from.startsWith('//')
      ? location.state.from
      : '/'
  if (auth.authenticated) return <Navigate to={returnTo} replace />
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    const f = new FormData(e.currentTarget)
    try {
      await auth.login(String(f.get('email')), String(f.get('password')))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  async function resetPassword() {
    const email = window.prompt('לאיזה אימייל לשלוח קישור איפוס?')?.trim()
    if (!email || !supabase) return
    setResetBusy(true)
    setError('')
    setInfo('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setInfo('אם קיים חשבון לכתובת זו, יישלח אליו קישור לאיפוס הסיסמה.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setResetBusy(false)
    }
  }
  return (
    <div className="login-page">
      <aside className="login-aside">
        <div className="brand">
          <Brand />
        </div>
        <div className="login-brand-story">
          <BrandSignature />
          <h1>
            פחות קצוות פתוחים.
            <br />
            יותר קשר עם הלקוחות.
          </h1>
          <p>לקוחות, פוליסות, חידושים ומשימות — סביבת עבודה אחת לסוכנות שלך.</p>
        </div>
        <div className="login-tagline">
          <ShieldCheck
            size={18}
            style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 8 }}
          />
          ניהול מסודר. שירות אישי.
        </div>
      </aside>
      <main className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <BrandSignature className="mobile-auth-brand" />
          <div className="eyebrow">ברוכים הבאים לוויקטוריה</div>
          <h1>טוב שחזרת</h1>
          <p>כניסה לסביבת העבודה של הסוכנות</p>
          <label className="field">
            <span>כתובת אימייל</span>
            <input
              className="field-control"
              name="email"
              type="email"
              dir="ltr"
              placeholder="name@agency.co.il"
              autoComplete="username"
              required
              disabled={!isConfigured || busy}
            />
          </label>
          <label className="field">
            <span>סיסמה</span>
            <input
              className="field-control"
              name="password"
              type="password"
              dir="ltr"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={!isConfigured || busy}
            />
          </label>
          {(error || auth.error) && (
            <div className="form-error" role="alert">
              {error || auth.error}
            </div>
          )}
          {info && (
            <div className="form-success" role="status">
              {info}
            </div>
          )}
          <Button type="submit" disabled={busy || !isConfigured}>
            <LogIn size={17} />
            {busy ? 'מתחבר…' : 'כניסה למערכת'}
          </Button>
          {isConfigured && (
            <Button type="button" variant="outline" onClick={resetPassword} disabled={resetBusy}>
              <Mail size={17} />
              {resetBusy ? 'שולח…' : 'שכחתי סיסמה'}
            </Button>
          )}
          {!isConfigured && (
            <p className="login-note">
              סביבת העבודה עדיין לא חוברה. להפעלת ההתחברות יש להגדיר את כתובת Supabase ואת המפתח
              הציבורי לפי הוראות ההתקנה.
            </p>
          )}
          {demoEnabled && (
            <>
              <div className="login-divider">להיכרות עם ויקטוריה</div>
              <Button type="button" variant="outline" onClick={auth.enterDemo}>
                כניסה לסביבת הדגמה
              </Button>
              <p className="login-note">
                נתונים בדיוניים בלבד. השינויים נשמרים בדפדפן הזה.
                <br />
                אין להזין מידע אישי אמיתי בסביבת ההדגמה.
              </p>
            </>
          )}
        </form>
      </main>
    </div>
  )
}
