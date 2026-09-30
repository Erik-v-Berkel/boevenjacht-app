import { useGameData } from '../lib/useGameData'
import { navigate } from '../lib/router'
import { Button, ErrorText, Screen } from '../components/ui'
import { EmergencyButton } from '../components/EmergencyButton'
import Lobby from './Lobby'
import MainScreen from './MainScreen'

export default function GameScreen({ gameId, userId }: { gameId: string; userId: string }) {
  const { state, reload } = useGameData(gameId)

  if (state.kind === 'loading') {
    return (
      <Screen>
        <p className="text-slate-400">Spel laden…</p>
      </Screen>
    )
  }
  if (state.kind === 'error') {
    return (
      <Screen>
        <ErrorText>{state.message}</ErrorText>
        <Button onClick={() => void reload()}>Opnieuw proberen</Button>
      </Screen>
    )
  }
  if (state.kind === 'not-member') {
    return (
      <Screen>
        <ErrorText>Je doet (op deze telefoon) niet mee aan dit spel.</ErrorText>
        <Button onClick={() => navigate('/', true)}>Naar het begin</Button>
      </Screen>
    )
  }

  const { data } = state
  const me = data.players.find((p) => p.user_id === userId)
  if (!me) return null

  return (
    <>
      {data.game.status === 'lobby' ? <Lobby data={data} me={me} /> : <MainScreen data={data} me={me} />}
      <EmergencyButton gameId={gameId} />
    </>
  )
}
