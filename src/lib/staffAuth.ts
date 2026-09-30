import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Staff-only: er is geen publieke zelfregistratie. Accounts worden buiten de app om
// aangemaakt (Supabase-dashboard/uitnodiging) voor het beheerscherm (COP-6, week 4).
// Elke ingelogde gebruiker is dus staff — klanten/spelers loggen nooit in, zij krijgen
// een join-link per e-mail (COP-5) en de checkout blijft anoniem (COP-46).

export async function signInStaff(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.session) throw new Error('Inloggen gelukt, maar er kwam geen sessie terug.')
  return data.session
}

export async function signOutStaff(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getStaffSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export function onStaffAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback)
  return () => subscription.unsubscribe()
}
