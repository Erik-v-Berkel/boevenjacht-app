import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Tracks } from './trackMath'

/** Alle routes van het spel (pas na afloop leesbaar). null = nog aan het laden. */
export function useLocationHistory(gameId: string): Tracks | null {
  const [tracks, setTracks] = useState<Tracks | null>(null)

  useEffect(() => {
    void supabase
      .from('location_history')
      .select('player_id, lat, lng, recorded_at')
      .eq('game_id', gameId)
      .order('recorded_at')
      .limit(20_000)
      .then(({ data }) => {
        const m: Tracks = new Map()
        for (const r of data ?? []) {
          if (!m.has(r.player_id)) m.set(r.player_id, [])
          m.get(r.player_id)!.push({ t: Date.parse(r.recorded_at), lat: r.lat, lng: r.lng })
        }
        setTracks(m)
      })
  }, [gameId])

  return tracks
}
