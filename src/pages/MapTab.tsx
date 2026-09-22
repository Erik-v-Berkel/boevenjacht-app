import { useMemo } from 'react'
import { GameMap, type Teammate } from '../components/GameMap'
import { photoLabel, thiefPhotos, usePhotoUrls } from '../lib/photos'
import type { GameData } from '../lib/useGameData'
import type { GeoState } from '../lib/useGeolocation'

export default function MapTab({
  data,
  now,
  geo,
  outside,
  onTap,
  teammates,
  banner,
}: {
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
        <span className="text-sky-400">●</span> beschikbaar · <span className="text-slate-400">●</span> gebruikt · 🍺🏛️ boevenfoto
      </div>
    </div>
  )
}
