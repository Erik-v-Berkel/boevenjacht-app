import type { Game, GameStatus } from './types'

/**
 * Fase volgens de klok. De server zet de status pas bij als iemand tick_game aanroept;
 * de telefoon toont de nieuwe fase al op het exacte moment.
 */
export function phaseAt(game: Pick<Game, 'status' | 'police_start_at' | 'ends_at'>, now: number): GameStatus {
  if (game.status === 'lobby' || game.status === 'ended') return game.status
  if (game.ends_at && now >= Date.parse(game.ends_at)) return 'ended'
  if (game.police_start_at && now < Date.parse(game.police_start_at)) return 'headstart'
  return 'running'
}

/** Heeft de server een tick nodig? (lokale fase loopt voor op de opgeslagen status, of er is een ping gepland) */
export function needsTick(game: Pick<Game, 'status' | 'police_start_at' | 'ends_at' | 'next_ping_at'>, now: number): boolean {
  if (phaseAt(game, now) !== game.status) return true
  return game.status === 'running' && game.next_ping_at !== null && now >= Date.parse(game.next_ping_at)
}

/** 5025 ms → "0:06"; 3 uur → "3:00:00". Rondt naar boven af, zodat 0 pas op het eind verschijnt. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export interface ClockSample {
  sentAt: number // lokale tijd bij versturen
  receivedAt: number // lokale tijd bij ontvangst
  serverTime: number // servertijd uit het antwoord
}

/** serverOffset zodat servertijd ≈ Date.now() + offset. Gebruikt het monster met de kortste roundtrip. */
export function computeOffset(samples: ClockSample[]): number {
  if (samples.length === 0) return 0
  const best = samples.reduce((a, b) => (b.receivedAt - b.sentAt < a.receivedAt - a.sentAt ? b : a))
  return best.serverTime - (best.sentAt + best.receivedAt) / 2
}

/** Echte milliseconden voor een aantal spelminuten (time_scale versnelt het spel). */
export function gameMinutesMs(minutes: number, timeScale: number): number {
  return (minutes * 60_000) / timeScale
}

/** "net", "23 min geleden", "1 u 5 min geleden" */
export function timeAgo(iso: string, now: number): string {
  const min = Math.floor((now - Date.parse(iso)) / 60_000)
  if (min < 1) return 'net'
  if (min < 60) return `${min} min geleden`
  return `${Math.floor(min / 60)} u ${min % 60} min geleden`
}
