import { useState } from 'react'
import { useStaffSession } from '../hooks/useStaffSession'
import { signInStaff, signOutStaff } from '../lib/staffAuth'
import { Button, ErrorText, Screen, inputClass } from '../components/ui'
import { StaffBookingsList } from '../components/StaffBookingsList'

// Staff-only login (COP-47/COP-52/COP-58): geen zelfregistratie, accounts komen uit het
// Supabase-dashboard. Na inloggen zie je de boekingenlijst (leestoegang, COP-6-fundament).
// Acties (eindtijd aanpassen, foto afkeuren, spel stoppen) zijn nog COP-6 (later).
export default function StaffLogin() {
  const { session, isLoading } = useStaffSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signInStaff(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inloggen mislukt.')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <p className="text-slate-400">Laden…</p>
      </Screen>
    )
  }

  if (session) {
    return (
      <Screen>
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Boekingen</h1>
            <p className="text-sm text-slate-400">Ingelogd als {session.user.email}</p>
          </div>
          <Button variant="secondary" className="w-auto" onClick={() => signOutStaff()}>
            Uitloggen
          </Button>
        </header>
        <StaffBookingsList />
      </Screen>
    )
  }

  return (
    <Screen>
      <h1 className="text-xl font-bold text-slate-100">Staff-login</h1>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <input
          type="email"
          required
          placeholder="E-mailadres"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          placeholder="Wachtwoord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Bezig…' : 'Inloggen'}
        </Button>
      </form>
    </Screen>
  )
}
