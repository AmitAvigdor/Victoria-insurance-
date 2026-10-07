import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const isConfigured = Boolean(url && key)
export const demoEnabled =
  !isConfigured && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true')
export const supabase = isConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(20000) }),
      },
    })
  : null
