import { useEffect, useState } from 'react'
import { formatDuration } from '../lib/clock'
import type { Position } from '../lib/geo'
import { enqueue, useQueueItem } from '../lib/uploadQueue'
import type { GameData } from '../lib/useGameData'
import type { GeoState } from '../lib/useGeolocation'
import { CameraCapture } from '../components/CameraCapture'
import { UploadStatus } from '../components/UploadStatus'
import { Button } from '../components/ui'

type Step =
  | { name: 'start' }
  | { name: 'camera' }
  | { name: 'confirm'; blob: Blob; url: string; pos: Position | null }
  | { name: 'sent'; clientId: string }

export default function PoliceCamera({ data, now, geo }: { data: GameData; now: number; geo: GeoState }) {
  const policeStart = Date.parse(data.game.police_start_at!)
  const [step, setStep] = useState<Step>({ name: 'start' })
  const [armed, setArmed] = useState(false)
  const sentItem = useQueueItem(step.name === 'sent' ? step.clientId : null)

  // Tweede tik moet binnen 4 seconden komen
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  useEffect(() => () => void (step.name === 'confirm' && URL.revokeObjectURL(step.url)), [step])

  if (now < policeStart) {
    return (
      <div className="mt-10 text-center">
        <p className="text-6xl">🔒</p>
        <p className="mt-3 text-lg">De camera is geblokkeerd tot jullie mogen vertrekken.</p>
        <p className="font-mono text-4xl font-black tabular-nums">{formatDuration((policeStart - now) * data.game.settings.time_scale)}</p>
      </div>
    )
  }

  if (step.name === 'camera') {
    return (
      <CameraCapture
        onCancel={() => setStep({ name: 'start' })}
        onCapture={(blob) =>
          setStep({ name: 'confirm', blob, url: URL.createObjectURL(blob), pos: geo.kind === 'ok' ? geo.pos : null })
        }
      />
    )
  }

  if (step.name === 'confirm') {
    const send = () => {
      if (!armed) {
        navigator.vibrate?.(50)
        return setArmed(true)
      }
      const clientId = crypto.randomUUID()
      void enqueue({ clientId, gameId: data.game.id, kind: 'capture', blob: step.blob, position: step.pos })
      setStep({ name: 'sent', clientId })
    }
    return (
      <div className="flex flex-col gap-3">
        <img src={step.url} alt="Vangstfoto" className="rounded-2xl" />
        <p className="text-sm text-slate-400">Staan de boeven er herkenbaar op?</p>
        <button
          onClick={send}
          className={`rounded-2xl px-4 py-5 text-2xl font-black text-white transition ${armed ? 'animate-pulse bg-red-600' : 'bg-blue-600'}`}
        >
          {armed ? 'Tik nogmaals om te bevestigen' : '🚨 Boeven gevangen!'}
        </button>
        <Button variant="secondary" onClick={() => setStep({ name: 'camera' })}>
          Opnieuw
        </Button>
      </div>
    )
  }

  if (step.name === 'sent') return <UploadStatus item={sentItem} onBack={() => setStep({ name: 'start' })} />

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-black">Vangen</h1>
      <p className="text-slate-300">
        Heb je de boeven? Maak een foto waarop ze herkenbaar staan en druk op <b>"Boeven gevangen!"</b>. De eerste vangstfoto
        die binnenkomt, wint.
      </p>
      <button onClick={() => setStep({ name: 'camera' })} className="rounded-2xl bg-blue-600 p-6 text-left text-white">
        <span className="text-4xl">📸</span> <b className="text-2xl">Vangstfoto maken</b>
      </button>
    </div>
  )
}
