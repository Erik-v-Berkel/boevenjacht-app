import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { joinLink } from '../lib/joinCode'
import type { GameData } from '../lib/useGameData'
import type { Player } from '../lib/types'
import { ErrorText, Screen } from '../components/ui'
import { HoldButton } from '../components/HoldButton'
import { QrCode } from '../components/QrCode'

export default function Lobby({ data, me }: { data: GameData; me: Player }) {
  const { game, teams, players } = data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showQr, setShowQr] = useState(false)
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

  const policeCount = teams.filter((t) => t.role === 'police').length
  const setPoliceTeams = async (n: number) => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('set_police_teams', { p_game_id: game.id, p_count: n })
    setBusy(false)
    if (error) setError(errorMessage(error))
  }

  const start = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('start_game', { p_game_id: game.id })
    setBusy(false)
    if (error) setError(errorMessage(error))
  }

  const withoutTeam = players.filter((p) => !p.team_id)
  const emptyTeams = teams.filter((t) => !players.some((p) => p.team_id === t.id))

  return (
    <Screen>
      <header className="flex items-end justify-between pt-4">
        <div>
          <p className="text-sm text-slate-400">Lobby · spelcode</p>
          <p className="font-mono text-3xl font-black tracking-widest text-yellow-400">{game.join_code}</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg bg-slate-800 px-3 py-2 text-sm ring-1 ring-slate-700" onClick={() => setShowQr(true)}>
            📱 QR
          </button>
          <button className="rounded-lg bg-slate-800 px-3 py-2 text-sm ring-1 ring-slate-700" onClick={share}>
            Delen
          </button>
        </div>
      </header>

      {showQr && (
        <button className="fixed inset-0 z-[3000] flex flex-col items-center justify-center gap-4 bg-slate-950/95 p-6" onClick={() => setShowQr(false)}>
          <p className="text-xl font-bold">Scan om mee te doen</p>
          <QrCode url={joinLink(location.origin, game.join_code)} size={Math.min(320, window.innerWidth - 80)} />
          <p className="font-mono text-4xl font-black tracking-widest text-yellow-400">{game.join_code}</p>
          <p className="text-sm text-slate-400">Tik om te sluiten</p>
        </button>
      )}

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

      <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 px-4 py-3 ring-1 ring-slate-700">
        <span className="text-slate-300">Polizei-teams</span>
        <div className="flex items-center gap-3">
          <button
            aria-label="Polizei-team verwijderen"
            className="h-10 w-10 rounded-full bg-slate-700 text-xl font-bold disabled:opacity-30"
            disabled={busy || policeCount <= 1}
            onClick={() => setPoliceTeams(policeCount - 1)}
          >
            −
          </button>
          <span className="w-4 text-center text-xl font-bold tabular-nums">{policeCount}</span>
          <button
            aria-label="Polizei-team toevoegen"
            className="h-10 w-10 rounded-full bg-slate-700 text-xl font-bold disabled:opacity-30"
            disabled={busy || policeCount >= 5}
            onClick={() => setPoliceTeams(policeCount + 1)}
          >
            +
          </button>
        </div>
      </div>

      {withoutTeam.length > 0 && (
        <p className="text-sm text-slate-400">Nog zonder team: {withoutTeam.map((p) => p.name).join(', ')}</p>
      )}

      <section className="mt-2 flex flex-col gap-2">
        <HoldButton disabled={busy || !me.team_id || emptyTeams.length > 0} onHold={start}>
          Los geht's! Start spel (3 sec. vasthouden)
        </HoldButton>
        <p className="text-center text-sm text-slate-400">
          {!me.team_id
            ? 'Kies eerst een team.'
            : emptyTeams.length > 0
              ? `Nog niemand in: ${emptyTeams.map((t) => t.name).join(', ')}`
              : 'Iedereen klaar? De boeven vertrekken direct na de start.'}
        </p>
      </section>
    </Screen>
  )
}
