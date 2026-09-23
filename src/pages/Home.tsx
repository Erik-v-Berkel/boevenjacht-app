import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/router'
import { normalizeJoinCode } from '../lib/joinCode'
import { Button, Screen, inputClass } from '../components/ui'
import { InstallHint } from '../components/InstallHint'

interface MyGame {
  game_id: string
  games: { join_code: string; status: string } | null
}

export default function Home({ userId }: { userId: string }) {
  const [code, setCode] = useState('')
  const [myGame, setMyGame] = useState<MyGame | null>(null)

  // Sessie herstellen: zit deze telefoon al in een spel?
  useEffect(() => {
    supabase
      .from('players')
      .select('game_id, games(join_code, status)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle<MyGame>()
      .then(({ data }) => setMyGame(data))
  }, [userId])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const c = normalizeJoinCode(code)
    if (c) navigate(`/j/${c}`)
  }

  const activeGame = myGame?.games ? myGame : null

  return (
    <Screen>
      <header className="pt-6 text-center">
        <img src="/icon.svg" alt="" className="mx-auto mb-3 h-20 w-20" />
        <h1 className="text-3xl font-black">Boevenjacht</h1>
        <p className="text-slate-400">Boeven gegen Polizei · Düsseldorf</p>
      </header>

      {activeGame && (
        <Button onClick={() => navigate(`/spel/${activeGame.game_id}`)}>
          {activeGame.games!.status === 'ended' ? 'Bekijk de uitslag' : 'Terug naar je spel'} ({activeGame.games!.join_code})
        </Button>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm text-slate-400" htmlFor="code">
          Spelcode
        </label>
        <input
          id="code"
          className={`${inputClass} text-center font-mono tracking-widest uppercase`}
          placeholder="BIER42"
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" variant={activeGame && activeGame.games!.status !== 'ended' ? 'secondary' : 'primary'} disabled={!code.trim()}>
          Doe mee
        </Button>
      </form>

      <InstallHint />

      <button className="mt-auto text-sm text-slate-500 underline" onClick={() => navigate('/nieuw')}>
        Nieuw spel aanmaken
      </button>
    </Screen>
  )
}
