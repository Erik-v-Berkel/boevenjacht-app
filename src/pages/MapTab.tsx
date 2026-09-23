import { useEffect, useMemo, useState } from 'react'
import { GameMap, type Teammate } from '../components/GameMap'
import { errorMessage } from '../lib/errors'
import { photoLabel, thiefPhotos, usePhotoUrls } from '../lib/photos'
import { supabase } from '../lib/supabase'
import type { GameData } from '../lib/useGameData'
import type { GeoState } from '../lib/useGeolocation'
import type { Team } from '../lib/types'

export default function MapTab({
  data,
  now,
  geo,
  outside,
  onTap,
  teammates,
  banner,
  team,
}: {
  team: Team | null
  data: GameData
  now: number
  geo: GeoState
  outside: boolean
  onTap?: (lat: number, lng: number) => void
  teammates?: Teammate[]
  banner?: string | null
}) {
  const photos = useMemo(() => thiefPhotos(data.photos), [data.photos])
  const usedSightIds = useMemo(() => new Set(photos.flatMap((p) => (p.sight_id ? [p.sight_id] : []))), [photos])
  const urls = usePhotoUrls(photos.map((p) => p.storage_path))
  const labels = useMemo(() => Object.fromEntries(photos.map((p) => [p.id, photoLabel(p, data.sights)])), [photos, data.sights])
  const me = geo.kind === 'ok' ? geo.pos : null
  const running = now >= Date.parse(data.game.police_start_at!)

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))]">
      <GameMap
        playArea={data.game.settings.play_area}
        sights={data.sights}
        usedSightIds={usedSightIds}
        photos={photos}
        photoUrls={urls}
        labels={labels}
        me={me}
        teammates={teammates}
        pings={data.pings}
        now={now}
        onTap={onTap}
      />
      <div className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[1000] flex flex-col gap-2 pr-14">
        {outside && <p className="rounded-lg bg-amber-500 px-3 py-2 font-semibold text-slate-900 shadow">⚠️ Je bent buiten het speelveld</p>}
        {banner && <p className="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white shadow">{banner}</p>}
        {geo.kind === 'denied' && <p className="rounded-lg bg-slate-900/90 px-3 py-2 text-sm shadow">Geen toegang tot je locatie</p>}
        {onTap && <p className="rounded-lg bg-slate-900/90 px-3 py-2 text-sm text-amber-200 shadow">🛠️ Tik op de kaart om je (nep)locatie te zetten</p>}
      </div>
      <div className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-slate-900/90 px-3 py-2 text-xs leading-5 shadow">
        <span className="text-sky-400">●</span> beschikbaar · <span className="text-slate-400">●</span> gebruikt · 🍺🏛️ boevenfoto ·{' '}
        <span className="text-orange-400">◌</span> ping
      </div>
      {team?.role === 'police' && running && <RadarButton data={data} team={team} />}
    </div>
  )
}

/** Eén keer per politieteam: vage cirkel rond de boeven, alleen voor dit team. */
function RadarButton({ data, team }: { data: GameData; team: Team }) {
  const checkpoints = data.photos.filter((p) => p.type === 'checkpoint' && p.status === 'accepted' && p.team_id === team.id).length
  const max = (data.game.settings.radars_per_team ?? 1) + checkpoints
  const left = max - data.pings.filter((p) => p.kind === 'radar' && p.team_id === team.id).length
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  if (left <= 0 && !error) return null

  const fire = async () => {
    if (!armed) return setArmed(true)
    setArmed(false)
    setBusy(true)
    const { error } = await supabase.rpc('use_radar', { p_game_id: data.game.id })
    setBusy(false)
    setError(error ? errorMessage(error) : '')
  }

  return (
    <div className="absolute inset-x-0 bottom-14 z-[1000] flex flex-col items-center gap-1 px-16">
      {error && <p className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white shadow">{error}</p>}
      {left > 0 && (
        <button
          onClick={fire}
          disabled={busy}
          className={`rounded-full px-5 py-3 font-bold shadow-lg ${armed ? 'bg-orange-500 text-white' : 'bg-slate-900/95 text-orange-300 ring-2 ring-orange-400'}`}
        >
          {busy ? 'Peilen…' : armed ? 'Tik nogmaals: radar gebruiken' : `📡 Radar (nog ${left}×)`}
        </button>
      )}
    </div>
  )
}
