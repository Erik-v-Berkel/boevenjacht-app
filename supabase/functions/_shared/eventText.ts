// Tekst en icoon voor een event. Gedeeld door de app (feed, meldingen, tijdlijn)
// en de Edge Function "push", dus zonder imports.

interface EventLike {
  type: string
  payload: Record<string, unknown>
}

interface Named {
  id: string
  name: string
}

export function eventText(e: EventLike, players: Named[], teams: Named[]): { icon: string; text: string } {
  const who = players.find((p) => p.id === e.payload.player_id)?.name
  const team = teams.find((t) => t.id === e.payload.team_id)?.name ?? 'de Polizei'
  switch (e.type) {
    case 'game_started':
      return { icon: '🏁', text: `Los geht's! Spel gestart${who ? ` door ${who}` : ''}. De boeven zijn vertrokken!` }
    case 'police_released':
      return { icon: '🚓', text: 'Achtung! De Polizei mag vertrekken!' }
    case 'bonus': {
      const beer = e.payload.photo_type === 'beer'
      const min = Number(e.payload.bonus_min)
      return {
        icon: beer ? '🍺' : '🏛️',
        text: `${beer ? 'Prost! ' : ''}Boeven${who ? ` (${who})` : ''}: ${min > 0 ? `−${min} min` : 'foto'} bij ${e.payload.label}`,
      }
    }
    case 'bonus_cap_reached':
      return { icon: '🧢', text: `Maximale aftrek bereikt (${e.payload.max} min). Foto's leveren de boeven geen tijd meer op.` }
    case 'capture':
      return { icon: '🚨', text: `Festgenommen! ${who ?? 'De Polizei'} (${team}) heeft de boeven gevangen!` }
    case 'game_ended':
      if (e.payload.winner === 'thieves') return { icon: '🦹', text: 'Entkommen! De tijd is op, de boeven zijn ontsnapt!' }
      return { icon: '🏆', text: `Spel voorbij: gewonnen door ${team}!` }
    case 'ping': {
      const located = e.payload.located !== false
      if (e.payload.kind === 'radar') {
        return { icon: '📡', text: located ? `Radar! ${team} heeft de boeven gepeild.` : `Radar van ${team}: geen signaal van de boeven.` }
      }
      if (!located) return { icon: '📡', text: 'Ping mislukt: geen signaal van de boeven.' }
      return {
        icon: '📡',
        text: e.payload.kind === 'final' ? 'Slotfase-ping! Kijk op de kaart waar de boeven zitten.' : 'Achtung, Ping! De boeven waren te lang stil. Kijk op de kaart.',
      }
    }
    default:
      return { icon: '•', text: e.type }
  }
}
