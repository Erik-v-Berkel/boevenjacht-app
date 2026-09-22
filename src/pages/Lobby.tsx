import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { joinLink } from '../lib/joinCode'
import type { GameData } from '../lib/useGameData'
import type { Player } from '../lib/types'
import { ErrorText, Screen } from '../components/ui'

export default function Lobby({ data, me }: { data: GameData; me: Player }) {
  const { game, teams, players } = data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const max = game.settings.max_players_per_team

  const choose = async (teamId: string | null) => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('choose_team', { p_game_id: game.id, p_team_id: teamId })
    setBusy(false)
    if (error) setError(errorMessage(error))
  }

  const share = async () => {
    const url = joinLink(location.origin, game.join_code)
    if (navigator.share) await navigator.share({ title: 'Boevenjacht', url }).catch(() => {})
    else await navigator.clipboard.writeText(url)
  }

  const withoutTeam = players.filter((p) => !p.team_id)

  return (
    <Screen>
      <header className="flex items-end justify-between pt-4">
        <div>
          <p className="text-sm text-slate-400">Lobby · spelcode</p>
          <p className="font-mono text-3xl font-black tracking-widest text-yellow-400">{game.join_code}</p>
        </div>
        <button className="rounded-lg bg-slate-800 px-3 py-2 text-sm ring-1 ring-slate-700" onClick={share}>
          Delen
        </button>
      </header>

      <p className="text-slate-300">
        {me.team_id ? 'Je kunt wisselen zolang het spel niet gestart is.' : 'Kies je team.'}
      </p>
      <ErrorText>{error}</ErrorText>

      <div className="flex flex-col gap-3">
        {teams.map((team) => {
          const members = players.filter((p) => p.team_id === team.id)
          const mine = me.team_id === team.id
          const full = members.length >= max
          return (
            <section
              key={team.id}
              className="rounded-2xl bg-slate-800/70 p-4 ring-1 ring-slate-700"
              style={{ borderLeft: `6px solid ${team.color}` }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  {team.role === 'thieves' ? '🦹 ' : '🚓 '}
                  {team.name}
                </h2>
                <span className="text-sm text-slate-400">
                  {members.length}/{max}
                </span>
              </div>
              <ul className="my-2 min-h-6 text-slate-200">
                {members.map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {p.id === me.id && <span className="text-slate-400"> (jij)</span>}
                  </li>
                ))}
                {members.length === 0 && <li className="text-slate-500">Nog niemand</li>}
              </ul>
              {mine ? (
                <button
                  className="text-sm text-slate-400 underline disabled:opacity-40"
                  disabled={busy}
                  onClick={() => choose(null)}
                >
                  Uit dit team stappen
                </button>
              ) : (
                <button
                  className="w-full rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-40"
                  style={{ backgroundColor: team.color }}
                  disabled={busy || full}
                  onClick={() => choose(team.id)}
                >
                  {full ? 'Vol' : me.team_id ? 'Wissel naar dit team' : 'Kies dit team'}
                </button>
              )}
            </section>
          )
        })}
      </div>

      {withoutTeam.length > 0 && (
        <p className="text-sm text-slate-400">Nog zonder team: {withoutTeam.map((p) => p.name).join(', ')}</p>
      )}
    </Screen>
  )
}
