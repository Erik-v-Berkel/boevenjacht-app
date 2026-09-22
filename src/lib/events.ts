import type { GameEvent, Player, Team } from './types'

/** Tekst en icoon voor een event in de feed, de meldingen en de tijdlijn. */
export function eventText(e: GameEvent, players: Player[], teams: Team[]): { icon: string; text: string } {
  const who = players.find((p) => p.id === e.payload.player_id)?.name
  switch (e.type) {
    case 'game_started':
      return { icon: '🏁', text: `Spel gestart${who ? ` door ${who}` : ''}. De boeven zijn vertrokken!` }
    case 'police_released':
      return { icon: '🚓', text: 'De politie mag vertrekken!' }
    case 'bonus': {
      const icon = e.payload.photo_type === 'beer' ? '🍺' : '🏛️'
      const min = Number(e.payload.bonus_min)
      return { icon, text: `Boeven${who ? ` (${who})` : ''}: ${min > 0 ? `−${min} min` : 'foto'} bij ${e.payload.label}` }
    }
    case 'bonus_cap_reached':
      return { icon: '🧢', text: `Maximale aftrek bereikt (${e.payload.max} min). Foto's leveren de boeven geen tijd meer op.` }
    case 'capture': {
      const team = teams.find((t) => t.id === e.payload.team_id)?.name ?? 'de politie'
      return { icon: '🚨', text: `${who ?? 'De politie'} (${team}) heeft de boeven gevangen!` }
    }
    case 'game_ended': {
      if (e.payload.winner === 'thieves') return { icon: '🦹', text: 'De tijd is op. De boeven zijn ontsnapt!' }
      const team = teams.find((t) => t.id === e.payload.team_id)?.name ?? 'de politie'
      return { icon: '🏆', text: `Spel voorbij: gewonnen door ${team}!` }
    }
    default:
      return { icon: '•', text: e.type }
  }
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
