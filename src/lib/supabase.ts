import { createClient } from '@supabase/supabase-js'
import { fetchWithClockRetry } from './fetchRetry'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  global: { fetch: fetchWithClockRetry },
})

/** Zorgt voor een anonieme sessie. Die blijft in localStorage, dus herladen herstelt de speler. */
export async function ensureSession(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user.id
  const { data: signIn, error } = await supabase.auth.signInAnonymously()
  if (error || !signIn.user) throw error ?? new Error('Inloggen mislukt')
  return signIn.user.id
}
