import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { Brand, BrandSignature } from '@/components/Brand'

export function ResetPassword() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const f = new FormData(e.currentTarget)
    const password = String(f.get('password'))
    const confirmation = String(f.get('confirmation'))
    try {
      if (password.length < 12)
        throw new Error('הסיסמה צריכה לכלול לפחות 12 תווים. מומלץ משפט סיסמה ייחודי.')
      if (password !== confirmation) throw new Error('הסיסמאות אינן זהות.')
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('הסיסמה עודכנה. אפשר להתחבר מחדש.')
      await auth.logout()
      navigate('/login', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
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
            קביעת סיסמה חדשה.
            <br />
            חוזרים לעבודה מסודרת.
          </h1>
          <p>בחרו סיסמה חדשה לחשבון הסוכנות.</p>
        </div>
      </aside>
      <main className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <BrandSignature className="mobile-auth-brand" />
          <div className="eyebrow">איפוס סיסמה</div>
          <h1>סיסמה חדשה</h1>
          <p>הקישור תקף לזמן קצר בלבד.</p>
          {auth.loading && (
            <div className="empty" role="status">
              מאמת את קישור האיפוס…
            </div>
          )}
          {!auth.loading && !auth.authenticated && (
            <div className="form-error" role="alert">
              קישור האיפוס אינו תקף או שפג תוקפו. יש לשלוח מייל איפוס חדש.
            </div>
          )}
          <label className="field">
            <span>סיסמה חדשה</span>
            <input
              className="field-control"
              name="password"
              type="password"
              dir="ltr"
              minLength={12}
              autoComplete="new-password"
              required
              disabled={busy || auth.loading || !auth.authenticated}
            />
          </label>
          <label className="field">
            <span>אימות סיסמה</span>
            <input
              className="field-control"
              name="confirmation"
              type="password"
              dir="ltr"
              minLength={12}
              autoComplete="new-password"
              required
              disabled={busy || auth.loading || !auth.authenticated}
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy || auth.loading || !auth.authenticated}>
            <KeyRound size={17} />
            {busy ? 'מעדכן…' : 'עדכון סיסמה'}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/login">חזרה להתחברות</Link>
          </Button>
        </form>
      </main>
    </div>
  )
}
