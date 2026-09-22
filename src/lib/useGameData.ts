import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Game, GameEvent, Player, Team } from './types'

export interface GameData {
  game: Game
  teams: Team[]
  players: Player[]
  events: GameEvent[] // nieuwste eerst
}

type State =
  | { kind: 'loading' }
  | { kind: 'not-member' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: GameData }

/** Laadt spel, teams en spelers en houdt ze realtime bij. Bij elke wijziging wordt alles opnieuw opgehaald (klein spel, simpel en robuust). */
export function useGameData(gameId: string) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  const load = useCallback(async () => {
    const [g, t, p, e] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).maybeSingle(),
      supabase.from('teams').select('*').eq('game_id', gameId).order('sort'),
      supabase.from('players').select('*').eq('game_id', gameId).order('joined_at'),
      supabase.from('events').select('*').eq('game_id', gameId).order('id', { ascending: false }),
    ])
    const error = g.error ?? t.error ?? p.error ?? e.error
    if (error) {
      setState((s) => (s.kind === 'ready' ? s : { kind: 'error', message: error.message }))
      return
    }
    if (!g.data) {
      setState({ kind: 'not-member' })
      return
    }
    setState({
      kind: 'ready',
      data: { game: g.data, teams: t.data ?? [], players: p.data ?? [], events: e.data ?? [] },
    })
  }, [gameId])

  useEffect(() => {
    void load()
    const reload = () => void load()
    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, reload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `game_id=eq.${gameId}` }, reload)
      .subscribe((status) => {
        // Na een herverbinding kunnen we wijzigingen gemist hebben.
        if (status === 'SUBSCRIBED') reload()
      })
    // Telefoon uit slaapstand: websocket is mogelijk weggevallen.
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [gameId, load])

  return { state, reload: load }
}
