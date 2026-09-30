import { useState } from 'react'
import { useStaffSession } from '../hooks/useStaffSession'
import { signInStaff, signOutStaff } from '../lib/staffAuth'
import { Button, ErrorText, Screen, inputClass } from '../components/ui'
import { StaffBookingsList } from '../components/StaffBookingsList'
import AdminPanel from './AdminPanel'

type StaffTab = 'games' | 'bookings'

// Staff-only login (COP-47/COP-52/COP-58/COP-6): geen zelfregistratie, accounts komen uit het
// Supabase-dashboard. Na inloggen kies je tussen het beheerscherm (spellen, COP-6) en de
// boekingenlijst (COP-58).
export default function StaffLogin() {
  const { session, isLoading } = useStaffSession()
  const [tab, setTab] = useState<StaffTab>('games')
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
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="flex gap-2">
            <StaffTabButton active={tab === 'games'} onClick={() => setTab('games')}>
              Spellen
            </StaffTabButton>
            <StaffTabButton active={tab === 'bookings'} onClick={() => setTab('bookings')}>
              Boekingen
            </StaffTabButton>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-slate-400 sm:inline">{session.user.email}</span>
            <Button variant="secondary" className="w-auto" onClick={() => signOutStaff()}>
              Uitloggen
            </Button>
          </div>
        </div>
        {tab === 'games' ? (
          <AdminPanel />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
            <h1 className="text-xl font-bold text-slate-100">Boekingen</h1>
            <StaffBookingsList />
          </div>
        )}
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

function StaffTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? 'bg-yellow-400 text-slate-900' : 'bg-slate-800 text-slate-300 ring-1 ring-slate-700'
      }`}
    >
      {children}
    </button>
  )
}
