import { formatDuration } from '../lib/clock'
import type { GameData } from '../lib/useGameData'
import { Screen } from '../components/ui'

export default function EndScreen({ data, now }: { data: GameData; now: number }) {
  const { game, teams } = data
  // De server kan nog op "running" staan terwijl de klok al op 0 is: dan winnen de boeven.
  const winner = game.status === 'ended' ? game.winner : 'thieves'
  const winningTeam = teams.find((t) => t.id === game.winning_team_id)
  const endedAt = game.status === 'ended' ? Math.min(now, Date.parse(game.ends_at!)) : Date.parse(game.ends_at!)
  const endEvent = data.events.find((e) => e.type === 'game_ended')
  const duration = (endEvent ? Date.parse(endEvent.created_at) : endedAt) - Date.parse(game.started_at!)

  return (
    <Screen>
      <div className="pt-16 text-center">
        <p className="text-7xl">{winner === 'thieves' ? '🦹' : '🚓'}</p>
        <h1 className="mt-4 text-4xl font-black">
          {winner === 'thieves' ? 'Boeven ontsnapt!' : `Gevangen door ${winningTeam?.name ?? 'de politie'}!`}
        </h1>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-slate-800 p-3">
          <dt className="text-sm text-slate-400">Totale aftrek</dt>
          <dd className="text-2xl font-bold">{game.bonus_total_min} min</dd>
        </div>
        <div className="rounded-xl bg-slate-800 p-3">
          <dt className="text-sm text-slate-400">Speelduur</dt>
          <dd className="font-mono text-2xl font-bold">{formatDuration(duration)}</dd>
        </div>
      </dl>
    </Screen>
  )
}
