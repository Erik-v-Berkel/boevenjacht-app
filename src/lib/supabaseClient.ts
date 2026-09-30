import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY ontbreekt. Kopieer .env.example naar .env.local en vul de Supabase-projectwaarden in.',
  )
}

// createClient() valideert de URL meteen en gooit anders synchroon bij het importeren van deze
// module — dat zou de hele app laten crashen als .env.local ontbreekt, in plaats van de
// nette laad/foutmeldingen die de UI al toont (zie BookingWizard). Een placeholder-URL houdt
// de client bruikbaar; echte calls falen dan pas (en netjes) op het moment van gebruik.
export const supabase = createClient(supabaseUrl || 'https://placeholder.invalid', supabaseAnonKey || 'placeholder-anon-key')
