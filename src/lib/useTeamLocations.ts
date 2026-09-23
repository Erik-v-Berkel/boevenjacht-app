import { useEffect, useMemo, useRef, useState } from 'react'
import { distance } from '@turf/distance'
import { point } from '@turf/helpers'
import { supabase } from './supabase'
import type { GameData } from './useGameData'
import type { GeoState } from './useGeolocation'
import type { Player, Team } from './types'
import type { Teammate } from '../components/GameMap'

const SEND_EVERY_MS = 15_000
const POLICE_SEND_EVERY_MS = 30_000 // alleen voor de replay na afloop
const FRESH_MS = 3 * 60_000 // oudere locaties tellen niet (telefoon op zak/uit)
export const TOGETHER_M = 100

interface Row {
  player_id: string
  lat: number
  lng: number
  updated_at: string
}

/** Afstand-waarschuwing: teamgenoot met de grootste afstand boven de grens. */
export function togetherWarning(me: { lat: number; lng: number } | null, mates: Teammate[]): string | null {
  if (!me || mates.length === 0) return null
  const far = mates
    .map((m) => ({ m, d: distance(point([me.lng, me.lat]), point([m.lng, m.lat]), { units: 'meters' }) }))
    .filter((x) => x.d > TOGETHER_M)
    .sort((a, b) => b.d - a.d)[0]
  return far ? `Blijf bij elkaar! ${far.m.name} is ${Math.round(far.d)} m verderop.` : null
}

/**
 * Boeven: sturen de eigen locatie elke 15 s en halen die van teamgenoten op.
 * Polizei: stuurt elke 30 s een locatie voor de replay na afloop, maar krijgt niets terug (RLS).
 */
export function useTeamLocations(data: GameData, me: Player, team: Team | null, geo: GeoState, active: boolean) {
  const isThief = team?.role === 'thieves' && active
  const isPolice = team?.role === 'police' && active
  const [rows, setRows] = useState<Row[]>([])
  const pos = geo.kind === 'ok' ? geo.pos : null
  const latestPos = useRef(pos)
  latestPos.current = pos

  useEffect(() => {
    if (!isThief) return
    const gameId = data.game.id
    const tick = async () => {
      const p = latestPos.current
      if (p) {
        await supabase.rpc('update_location', { p_game_id: gameId, p_lat: p.lat, p_lng: p.lng, p_accuracy_m: p.accuracy })
      }
      const { data: locs } = await supabase.from('player_locations').select('player_id, lat, lng, updated_at').eq('game_id', gameId)
      if (locs) setRows(locs)
    }
    void tick()
    const id = setInterval(() => void tick(), SEND_EVERY_MS)
    return () => clearInterval(id)
  }, [isThief, data.game.id])

  useEffect(() => {
    if (!isPolice) return
    const gameId = data.game.id
    const send = () => {
      const p = latestPos.current
      if (p) void supabase.rpc('update_location', { p_game_id: gameId, p_lat: p.lat, p_lng: p.lng, p_accuracy_m: p.accuracy })
    }
    const first = setTimeout(send, 2000) // wacht op de eerste GPS-positie
    const id = setInterval(send, POLICE_SEND_EVERY_MS)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [isPolice, data.game.id])

  // Memo: MainScreen rendert elke 250 ms; een nieuwe array zou de kaart steeds opnieuw laten tekenen.
  const teammates = useMemo<Teammate[]>(() => {
    const now = Date.now()
    return rows
      .filter((r) => r.player_id !== me.id && now - Date.parse(r.updated_at) < FRESH_MS)
      .map((r) => ({ name: data.players.find((p) => p.id === r.player_id)?.name ?? '?', lat: r.lat, lng: r.lng }))
  }, [rows, data.players, me.id])

  if (!isThief) return { teammates: undefined, warning: null }
  return { teammates, warning: togetherWarning(pos, teammates) }
}
