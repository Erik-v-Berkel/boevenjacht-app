import { useEffect, useRef, useState } from 'react'
import { captureVideoFrame, compressImage } from '../lib/image'
import { ErrorText } from './ui'

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)

/**
 * Live camera (achtercamera). Foto's komen uit het videobeeld, niet uit de fotorol.
 * Lukt getUserMedia niet, dan de terugvaloptie <input capture="environment">.
 */
export function CameraCapture({ onCapture, onCancel }: { onCapture: (blob: Blob) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'denied' | 'fallback'>('starting')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('fallback')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        setState('live')
      })
      .catch((err: DOMException) => setState(err.name === 'NotAllowedError' ? 'denied' : 'fallback'))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const shoot = async () => {
    if (!video.current) return
    setBusy(true)
    navigator.vibrate?.(30)
    try {
      onCapture(await captureVideoFrame(video.current))
    } finally {
      setBusy(false)
    }
  }

  const fromFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onCapture(await compressImage(file))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {state === 'denied' && (
        <ErrorText>
          Geen toegang tot de camera.{' '}
          {isIOS()
            ? 'Zet het aan via Instellingen → Safari → Camera → Sta toe, en herlaad de app.'
            : 'Tik op het slotje naast het adres → Rechten → Camera → Toestaan, en herlaad de app.'}
        </ErrorText>
      )}

      {(state === 'starting' || state === 'live') && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="aspect-[3/4] w-full object-cover" />
          {state === 'starting' && <p className="absolute inset-0 grid place-items-center text-slate-400">Camera starten…</p>}
        </div>
      )}

      {state === 'live' && (
        <button
          onClick={shoot}
          disabled={busy}
          aria-label="Foto maken"
          className="mx-auto h-20 w-20 rounded-full border-4 border-white bg-white/20 active:bg-white/60 disabled:opacity-40"
        />
      )}

      {state === 'fallback' && (
        <label className="rounded-xl bg-yellow-400 px-4 py-3 text-center text-lg font-semibold text-slate-900">
          📷 Foto maken
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void fromFile(e.target.files?.[0])}
          />
        </label>
      )}

      <button className="text-slate-400 underline" onClick={onCancel}>
        Annuleren
      </button>
    </div>
  )
}
