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

/** Heeft de server een tick nodig? (lokale fase loopt voor op de opgeslagen status) */
export function needsTick(game: Pick<Game, 'status' | 'police_start_at' | 'ends_at'>, now: number): boolean {
  return phaseAt(game, now) !== game.status
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
