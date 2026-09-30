import { useState } from 'react'
import { useStaffSession } from '../hooks/useStaffSession'
import { signInStaff, signOutStaff } from '../lib/staffAuth'
import { Button, ErrorText, Screen, inputClass } from '../components/ui'
import AdminPanel from './AdminPanel'

// Staff-only login (COP-47/COP-52): geen zelfregistratie, accounts komen uit het
// Supabase-dashboard. Na inloggen zie je meteen het beheerscherm (COP-6).
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
      <>
        <AdminPanel />
        <div className="fixed top-3 right-3 z-[2600] flex items-center gap-2 rounded-full bg-slate-900/90 py-1 pr-1 pl-3 text-sm ring-1 ring-slate-700">
          <span className="text-slate-300">{session.user.email}</span>
          <button onClick={() => signOutStaff()} className="rounded-full bg-slate-800 px-3 py-1 text-slate-100 ring-1 ring-slate-700">
            Uitloggen
          </button>
        </div>
      </>
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
