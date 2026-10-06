import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { demoEnabled, supabase } from '@/lib/supabase'
import { demoIdentity } from '@/services/demo-seed'
import { demoRepository } from '@/services/demo'
import { supabaseRepository } from '@/services/supabase'
import type { Identity } from '@/domain/types'
import type { Repository } from '@/services/repository'
interface AuthState {
  identity: Identity | null
  repository: Repository | null
  loading: boolean
  error: string | null
  authenticated: boolean
  isDemo: boolean
  login: (email: string, password: string) => Promise<void>
  enterDemo: () => void
  logout: () => Promise<void>
  retry: () => void
}
const AuthContext = createContext<AuthState | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [isDemo, setDemo] = useState(
    () => demoEnabled && sessionStorage.getItem('keshet-demo-session') === 'true',
  )
  useEffect(() => {
    if (!supabase) return
    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, current) => {
      if (active) {
        if (!current) void client.cancelQueries().then(() => client.clear())
        setSession(current)
        setReady(true)
      }
    })
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          if (error) setSessionError('לא ניתן לשחזר את ההתחברות. נסו שוב.')
          setSession(data.session)
          setReady(true)
        }
      })
      .catch(() => {
        if (active) {
          setSessionError('לא ניתן להתחבר לשירות. נסו שוב.')
          setReady(true)
        }
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [client])
  const identityQuery = useQuery({
    queryKey: ['identity', session?.user.id],
    enabled: !!session && !isDemo,
    queryFn: async (): Promise<Identity> => {
      const { data: profile, error } = await supabase!
        .from('profiles')
        .select('id,agency_id,full_name,role')
        .eq('id', session!.user.id)
        .single()
      if (error || !profile)
        throw new Error('המשתמש טרם שויך לסוכנות. יש לבקש ממנהל המערכת להשלים את השיוך.')
      const { data: agency, error: agencyError } = await supabase!
        .from('agencies')
        .select('id,name')
        .eq('id', profile.agency_id)
        .single()
      if (agencyError || !agency) throw new Error('לא ניתן לטעון את פרטי הסוכנות')
      return { profile, agency, email: session!.user.email || '' }
    },
    retry: 1,
  })
  const identity = isDemo ? demoIdentity : session ? identityQuery.data || null : null
  const repository = useMemo(
    () => (identity ? (isDemo ? demoRepository : supabaseRepository(supabase!, identity)) : null),
    [identity, isDemo],
  )
  const sessionUserId = session?.user.id
  useEffect(() => {
    if (!sessionUserId || isDemo) return
    const key = `victoria-last-active:${sessionUserId}`
    const idleLimit = 15 * 60 * 1000
    let last = Number(localStorage.getItem(key)) || Date.now()
    let ending = false
    const expire = async () => {
      if (ending) return
      ending = true
      setSession(null)
      await client.cancelQueries()
      client.clear()
      await supabase!.auth.signOut({ scope: 'local' })
    }
    const check = () => {
      last = Math.max(last, Number(localStorage.getItem(key)) || 0)
      if (Date.now() - last >= idleLimit) void expire()
    }
    const activity = () => {
      check()
      if (!ending && Date.now() - last > 1000) {
        last = Date.now()
        localStorage.setItem(key, String(last))
      }
    }
    check()
    const timer = window.setInterval(check, 10000)
    const events = ['pointerdown', 'keydown', 'scroll'] as const
    for (const event of events) window.addEventListener(event, activity, { passive: true })
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      for (const event of events) window.removeEventListener(event, activity)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [sessionUserId, isDemo, client])
  const value: AuthState = {
    identity,
    repository,
    isDemo,
    authenticated: !!session || isDemo,
    loading: !ready || (!!session && identityQuery.isPending),
    error: sessionError || identityQuery.error?.message || null,
    retry: () => {
      setSessionError(null)
      void identityQuery.refetch()
    },
    login: async (email, password) => {
      if (!supabase) throw new Error('יש להשלים את הגדרות Supabase לפני התחברות')
      setSessionError(null)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw new Error('ההתחברות נכשלה. בדקו את כתובת האימייל והסיסמה ונסו שוב.')
      if (data.user)
        localStorage.setItem(`victoria-last-active:${data.user.id}`, String(Date.now()))
    },
    enterDemo: () => {
      if (!demoEnabled) return
      sessionStorage.setItem('keshet-demo-session', 'true')
      setDemo(true)
    },
    logout: async () => {
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'local' })
        if (error) throw new Error('ההתנתקות נכשלה. נסו שוב.')
      }
      sessionStorage.removeItem('keshet-demo-session')
      setDemo(false)
      setSession(null)
      await client.cancelQueries()
      client.clear()
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider missing')
  return context
}
