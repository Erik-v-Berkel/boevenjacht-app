import { useEffect, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import type { Polygon } from 'geojson'
import { supabase } from '../lib/supabase'
import { clockTime } from '../lib/events'
import { formatDuration } from '../lib/clock'
import type { Photo, Ping, Player, Team } from '../lib/types'

interface Point {
  t: number
  lat: number
  lng: number
}

const PLAY_MS = 40_000 // hele spel in 40 seconden
const PING_VISIBLE_MS = 10 * 60_000 // speltijd

/** Laatste punt op of vóór t (binair zoeken). */
function at(track: Point[], t: number): Point | null {
  let lo = 0
  let hi = track.length - 1
  if (hi < 0 || track[0].t > t) return null
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (track[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return track[lo]
}

/**
 * Het hele spel afspelen: routes van alle spelers, foto's en pings op het moment dat ze gebeurden.
 * Locaties zijn pas na afloop leesbaar (RLS). Geen geschiedenis (ouder spel)? Dan `fallback`.
 */
export function ReplayMap({
  gameId,
  start,
  end,
  timeScale,
  teams,
  players,
  photos,
  pings,
  playArea,
  fallback,
}: {
  gameId: string
  start: number
  end: number
  timeScale: number
  teams: Team[]
  players: Player[]
  photos: Photo[]
  pings: Ping[]
  playArea?: Polygon
  fallback: ReactNode
}) {
  const [tracks, setTracks] = useState<Map<string, Point[]> | null>(null)
  const [t, setT] = useState(end)
  const [playing, setPlaying] = useState(false)
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<{ markers: Map<string, L.Marker>; events: L.LayerGroup } | null>(null)

  useEffect(() => {
    void supabase
      .from('location_history')
      .select('player_id, lat, lng, recorded_at')
      .eq('game_id', gameId)
      .order('recorded_at')
      .limit(20_000)
      .then(({ data }) => {
        const m = new Map<string, Point[]>()
        for (const r of data ?? []) {
          if (!m.has(r.player_id)) m.set(r.player_id, [])
          m.get(r.player_id)!.push({ t: Date.parse(r.recorded_at), lat: r.lat, lng: r.lng })
        }
        setTracks(m)
      })
  }, [gameId])

  // Via een ref: het spel herlaadt bij elke wijziging, maar de kaart moet maar één keer opgebouwd worden.
  const info = useRef({ teams, players, playArea })
  info.current = { teams, players, playArea }

  // Kaart + routes tekenen zodra de geschiedenis er is
  useEffect(() => {
    if (!tracks || tracks.size === 0 || !el.current) return
    const { teams, players, playArea } = info.current
    const byTeam = new Map(teams.map((tm) => [tm.id, tm.color]))
    const colorOf = (playerId: string) => byTeam.get(players.find((p) => p.id === playerId)?.team_id ?? '') ?? '#94a3b8'
    const all = [...tracks.values()].flat().map((p) => [p.lat, p.lng] as [number, number])
    const m = L.map(el.current, { zoomControl: false, zoomSnap: 0.25 })
    // Eerst de weergave zetten, anders kan Leaflet de lijnen niet tekenen
    if (playArea) m.fitBounds(L.geoJSON(playArea).getBounds(), { padding: [4, 4] })
    else m.fitBounds(L.latLngBounds(all), { padding: [20, 20] })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    if (playArea) {
      L.geoJSON(playArea, { style: { color: '#facc15', weight: 2, fill: false, dashArray: '8 6' }, interactive: false }).addTo(m)
    }
    const markers = new Map<string, L.Marker>()
    for (const [playerId, track] of tracks) {
      const color = colorOf(playerId)
      const line = track.map((p) => [p.lat, p.lng] as [number, number])
      L.polyline(line, { color, weight: 3, opacity: 0.35, interactive: false }).addTo(m)
      const name = players.find((p) => p.id === playerId)?.name ?? '?'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px #0008;color:white;font:bold 11px/18px sans-serif;text-align:center">${name.slice(0, 1).toUpperCase().replace(/[<>&]/g, '')}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })
      markers.set(playerId, L.marker([track[0].lat, track[0].lng], { icon }).bindTooltip(name.replace(/[<>&]/g, '')))
    }
    const events = L.layerGroup().addTo(m)
    map.current = m
    layers.current = { markers, events }
    return () => {
      m.remove()
      map.current = null
      layers.current = null
    }
  }, [tracks])

  // Stand op tijdstip t
  useEffect(() => {
    const m = map.current
    const l = layers.current
    if (!m || !l || !tracks) return
    for (const [playerId, marker] of l.markers) {
      const p = at(tracks.get(playerId)!, t)
      if (p) {
        marker.setLatLng([p.lat, p.lng])
        if (!m.hasLayer(marker)) marker.addTo(m)
      } else if (m.hasLayer(marker)) marker.remove()
    }
    l.events.clearLayers()
    for (const p of photos) {
      if (p.lat === null || p.lng === null || Date.parse(p.created_at) > t) continue
      const icon = L.divIcon({
        className: '',
        html: `<div style="font-size:16px;line-height:24px;width:24px;height:24px;text-align:center;border-radius:9999px;background:#dc2626;border:2px solid white">${p.type === 'beer' ? '🍺' : p.type === 'sight' ? '🏛️' : '🚨'}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })
      L.marker([p.lat, p.lng], { icon, interactive: false }).addTo(l.events)
    }
    for (const p of pings) {
      const since = t - Date.parse(p.created_at)
      if (p.lat === null || p.lng === null || since < 0 || since > PING_VISIBLE_MS / timeScale) continue
      L.circle([p.lat, p.lng], { radius: p.radius_m, color: '#f97316', weight: 2, dashArray: '6 6', fillOpacity: 0.15, interactive: false }).addTo(l.events)
    }
  }, [t, tracks, photos, pings, timeScale])

  // Afspelen
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    const step = (now: number) => {
      const dt = ((now - last) / PLAY_MS) * (end - start)
      last = now
      setT((cur) => {
        const next = Math.min(end, cur + dt)
        if (next >= end) setPlaying(false)
        return next
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, start, end])

  if (tracks === null) return <p className="text-sm text-slate-400">Replay laden…</p>
  if (tracks.size === 0) return <>{fallback}</>

  return (
    <div className="flex flex-col gap-2">
      <div ref={el} className="h-[55vh] w-full overflow-hidden rounded-2xl" />
      <div className="flex items-center gap-3">
        <button
          className="w-12 shrink-0 rounded-full bg-yellow-400 py-2 text-lg text-slate-900"
          aria-label={playing ? 'Pauze' : 'Afspelen'}
          onClick={() => {
            if (!playing && t >= end) setT(start)
            setPlaying(!playing)
          }}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          className="flex-1 accent-yellow-400"
          min={start}
          max={end}
          step={1000}
          value={t}
          onChange={(e) => {
            setPlaying(false)
            setT(Number(e.target.value))
          }}
        />
        <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums">
          {formatDuration((t - start) * timeScale)}
          <span className="block text-xs text-slate-500">{clockTime(new Date(t).toISOString())}</span>
        </span>
      </div>
    </div>
  )
}
