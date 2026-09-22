import { useEffect, useState } from 'react'
import { ensureSession, supabaseConfigured } from './lib/supabase'
import { errorMessage } from './lib/errors'
import { usePath } from './lib/router'
import { Button, ErrorText, Screen } from './components/ui'
import Home from './pages/Home'
import NewGame from './pages/NewGame'
import Join from './pages/Join'
import GameScreen from './pages/GameScreen'

export default function App() {
  const path = usePath()
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const connect = () => {
    setError('')
    ensureSession().then(setUserId, (e) => setError(errorMessage(e)))
  }
  useEffect(() => {
    if (supabaseConfigured) connect()
  }, [])

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
