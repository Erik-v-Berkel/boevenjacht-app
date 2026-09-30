import { useState } from 'react'
import { useStaffSession } from '../hooks/useStaffSession'
import { signInStaff, signOutStaff } from '../lib/staffAuth'
import { Button, ErrorText, Screen, inputClass } from '../components/ui'

// Staff-only login (COP-47/COP-52): geen zelfregistratie, accounts komen uit het
// Supabase-dashboard. Het beheerscherm zelf is COP-6 (later); dit scherm bewijst
// alleen dat een staff-account kan inloggen en uitloggen.
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
        <p className="text-slate-200">Ingelogd als {session.user.email}.</p>
        <Button variant="secondary" onClick={() => signOutStaff()}>
          Uitloggen
        </Button>
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
