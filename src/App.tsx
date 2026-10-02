import { useEffect, useState } from 'react'
import { ensureSession, supabaseConfigured } from './lib/supabase'
import { errorMessage } from './lib/errors'
import { usePath } from './lib/router'
import { Button, ErrorText, Screen } from './components/ui'
import { BookingWizard } from './components/BookingWizard'
import { BookingThankYou } from './pages/BookingThankYou'
import Home from './pages/Home'
import NewGame from './pages/NewGame'
import Join from './pages/Join'
import GameScreen from './pages/GameScreen'
import StaffLogin from './pages/StaffLogin'

export default function App() {
  const path = usePath()
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const bookingThankYou = path.match(/^\/boeken\/bedankt\/([0-9a-f-]{36})\/?$/)

  // /boeken (stadspakket-checkout), /boeken/bedankt/:id (terug van Mollie) en /staff
  // (staff-login) zijn eigen funnels en wachten niet op de anonieme spelers-sessie
  // hieronder (COP-52, COP-5).
  const skipsPlayerSession = path === '/boeken' || bookingThankYou !== null || path === '/staff'

  const connect = () => {
    setError('')
    ensureSession().then(setUserId, (e) => setError(errorMessage(e)))
  }
  useEffect(() => {
    if (supabaseConfigured && !skipsPlayerSession) connect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipsPlayerSession])

  if (path === '/boeken') return <BookingWizard />
  if (bookingThankYou) return <BookingThankYou bookingId={bookingThankYou[1]} />
  if (path === '/staff') return <StaffLogin />

  if (!supabaseConfigured) {
    return (
      <Screen>
        <ErrorText>Supabase is niet ingesteld (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ontbreken).</ErrorText>
      </Screen>
    )
  }
  if (error) {
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <Button onClick={connect}>Opnieuw proberen</Button>
      </Screen>
    )
  }
  if (!userId) {
    return (
      <Screen>
        <p className="text-slate-400">Laden…</p>
      </Screen>
    )
  }

  const join = path.match(/^\/j\/([^/]+)\/?$/)
  if (join) return <Join code={decodeURIComponent(join[1])} />
  const game = path.match(/^\/spel\/([0-9a-f-]{36})\/?$/)
  if (game) return <GameScreen gameId={game[1]} userId={userId} />
  if (path === '/nieuw') return <NewGame />
  return <Home userId={userId} />
}
