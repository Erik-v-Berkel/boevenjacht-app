import { useEffect, useMemo, useState } from 'react'
import { normalizeBarName } from '../lib/barName'
import { formatDuration, gameMinutesMs } from '../lib/clock'
import { checkSight, insidePlayArea, type Position } from '../lib/geo'
import { enqueue, useQueueItem, useUploadQueue } from '../lib/uploadQueue'
import { devModeAllowed, type GeoState } from '../lib/useGeolocation'
import type { GameData } from '../lib/useGameData'
import { CameraCapture } from '../components/CameraCapture'
import { DevGps } from '../components/DevGps'
import { Button, ErrorText, inputClass } from '../components/ui'
import { PendingUploads, UploadStatus } from '../components/UploadStatus'

type Kind = 'beer' | 'sight'
type Step =
  | { name: 'choose' }
  | { name: 'camera'; kind: Kind }
  | { name: 'confirm'; kind: Kind; blob: Blob; url: string; pos: Position | null }
  | { name: 'sent'; clientId: string }

export default function ThiefCamera({ data, now, geo }: { data: GameData; now: number; geo: GeoState }) {
  const { game, photos, sights } = data
  const s = game.settings
  const dev = devModeAllowed(s.time_scale)
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [barName, setBarName] = useState('')
  const queue = useUploadQueue(game.id)
  const sentItem = useQueueItem(step.name === 'sent' ? step.clientId : null)

  const accepted = photos.filter((p) => p.status === 'accepted' && (p.type === 'beer' || p.type === 'sight'))
  const usedSights = useMemo(() => new Set(accepted.flatMap((p) => (p.sight_id ? [p.sight_id] : []))), [accepted])
  const usedBars = accepted.filter((p) => p.type === 'beer' && p.bar_name)
  const last = accepted.at(-1)
  const cooldownLeft = last ? Date.parse(last.created_at) + gameMinutesMs(s.cooldown_min, s.time_scale) - now : 0
  const capReached = game.bonus_total_min >= s.max_bonus_total_min
  const pos = geo.kind === 'ok' ? geo.pos : null
  const outside = pos ? !insidePlayArea(s.play_area, pos.lat, pos.lng) : false
  const sightCheck = pos ? checkSight(sights, usedSights, pos) : null

  // Voorbeeld-URL opruimen
  useEffect(() => () => void (step.name === 'confirm' && URL.revokeObjectURL(step.url)), [step])

  const submit = (kind: Kind, blob: Blob, position: Position | null) => {
    const clientId = crypto.randomUUID()
    void enqueue({ clientId, gameId: game.id, kind, blob, position, barName: kind === 'beer' ? barName.trim() : undefined })
    setBarName('')
    setStep({ name: 'sent', clientId })
  }

  // Trillen zodra de server geantwoord heeft
  const sentState = sentItem?.state === 'done' ? sentItem.result?.status : undefined
  useEffect(() => {
    if (sentState) navigator.vibrate?.(sentState === 'accepted' ? [100, 50, 100] : 300)
  }, [sentState])

  if (step.name === 'camera') {
    return (
      <CameraCapture
        onCancel={() => setStep({ name: 'choose' })}
        onCapture={(blob) => setStep({ name: 'confirm', kind: step.kind, blob, url: URL.createObjectURL(blob), pos })}
      />
    )
  }

  if (step.name === 'confirm') {
    const norm = normalizeBarName(barName)
    const barUsed = step.kind === 'beer' && norm !== '' && usedBars.some((p) => p.bar_name_norm === norm)
    return (
      <div className="flex flex-col gap-3">
        <img src={step.url} alt="Jouw foto" className="rounded-2xl" />
        {step.kind === 'beer' && (
          <>
            <input
              className={inputClass}
              placeholder="Naam van de kroeg"
              list="used-bars"
              value={barName}
              autoFocus
              onChange={(e) => setBarName(e.target.value)}
            />
            <datalist id="used-bars">
              {usedBars.map((p) => (
                <option key={p.id} value={p.bar_name!} />
              ))}
            </datalist>
            {barUsed && <ErrorText>Deze kroeg is al gebruikt.</ErrorText>}
          </>
        )}
        {capReached && <Warning text="Maximale aftrek bereikt, deze foto levert geen tijd meer op (maar verraadt wel je locatie!)" />}
        <Button
          disabled={step.kind === 'beer' && (!norm || barUsed)}
          onClick={() => submit(step.kind, step.blob, step.pos)}
        >
          Versturen
        </Button>
        <Button variant="secondary" onClick={() => setStep({ name: 'camera', kind: step.kind })}>
          Opnieuw
        </Button>
      </div>
    )
  }

  if (step.name === 'sent') return <UploadStatus item={sentItem} onBack={() => setStep({ name: 'choose' })} />

  // Keuzescherm met uitleg waarom iets (nog) niet kan
  const blocked = cooldownLeft > 0 ? `Wachttijd: nog ${formatDuration(cooldownLeft * s.time_scale)}` : gpsProblem(geo) ?? (outside ? 'Je bent buiten het speelveld' : null)
  const sightProblem =
    sightCheck?.kind === 'used'
      ? `${sightCheck.sight.name} is al gebruikt`
      : sightCheck?.kind === 'inaccurate'
        ? 'GPS nog niet nauwkeurig genoeg, even wachten…'
        : sightCheck?.kind === 'none'
          ? `Te ver weg${sightCheck.nearest ? `: ${sightCheck.nearest.name} is ${Math.round(sightCheck.distance)} m` : ''}`
          : null

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-black">Bonusfoto</h1>
      {dev && <DevGps sights={sights} />}
      <PendingUploads items={queue} />
      <GpsLine geo={geo} />
      {capReached && <Warning text="Maximale aftrek bereikt, foto's leveren geen tijd meer op (maar verraden wel je locatie!)" />}
      {blocked && <ErrorText>{blocked}</ErrorText>}

      <button
        disabled={!!blocked}
        onClick={() => setStep({ name: 'camera', kind: 'beer' })}
        className="rounded-2xl bg-amber-500 p-5 text-left text-slate-900 disabled:opacity-40"
      >
        <span className="text-3xl">🍺</span> <b className="text-xl">Bier in een kroeg</b>
        <span className="block">−{s.beer_bonus_min} min · bier zichtbaar op de foto · elke kroeg 1×</span>
      </button>

      <button
        disabled={!!blocked || !!sightProblem}
        onClick={() => setStep({ name: 'camera', kind: 'sight' })}
        className="rounded-2xl bg-sky-500 p-5 text-left text-slate-900 disabled:opacity-40"
      >
        <span className="text-3xl">🏛️</span> <b className="text-xl">Bezienswaardigheid</b>
        <span className="block">
          −{s.sight_bonus_min} min · {sightCheck?.kind === 'ok' ? `je bent bij ${sightCheck.sight.name}` : (sightProblem ?? 'locatie zoeken…')}
        </span>
      </button>

      <p className="text-sm text-slate-400">⚠️ Elke foto laat direct je locatie zien aan de Polizei.</p>
    </div>
  )
}

function gpsProblem(geo: GeoState): string | null {
  if (geo.kind === 'denied') return 'Geen toegang tot je locatie. Zet het aan (iPhone: Instellingen → Privacy → Locatievoorzieningen → Safari) en herlaad.'
  if (geo.kind === 'unavailable') return 'Locatie niet beschikbaar. Zonder GPS geen bonus.'
  if (geo.kind === 'waiting') return 'Locatie zoeken…'
  return null
}

function GpsLine({ geo }: { geo: GeoState }) {
  if (geo.kind !== 'ok') return null
  const acc = Math.round(geo.pos.accuracy)
  return (
    <p className={`text-sm ${acc > 50 ? 'text-amber-400' : 'text-slate-400'}`}>
      📍 GPS {geo.fake ? '(nep) ' : ''}nauwkeurig tot {acc} m
    </p>
  )
}

function Warning({ text }: { text: string }) {
  return <p className="rounded-lg bg-amber-950 px-3 py-2 text-amber-200 ring-1 ring-amber-800">{text}</p>
}
