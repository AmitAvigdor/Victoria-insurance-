import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createHandler } from './handler.mjs'

Deno.serve(
  createHandler({
    createClient,
    url: Deno.env.get('SUPABASE_URL')!,
    publicKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    secretKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    origins: ['https://victoria-insurance-tau.vercel.app'],
  }),
)
