import { createClient } from '@supabase/supabase-js'
import { fetchWithClockRetry } from './fetchRetry'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// createClient() throws synchronously on a schemeless host (e.g. "xyz.supabase.co"
// zonder "https://"), wat de hele module — en dus de hele app — laat crashen bij
// het opstarten. Vercel-envvars worden soms zonder protocol ingevuld, dus normaliseren.
const url = rawUrl && !/^https?:\/\//i.test(rawUrl) ? `https://${rawUrl}` : rawUrl

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
