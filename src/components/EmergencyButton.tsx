import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'

/** Best-effort locatie voor de noodmelding; nooit blokkeren of falen als die er niet is. */
function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 30000 },
    )
  })
}

/** Noodknop (COP-7): overal zichtbaar tijdens de lobby en het spel. Bellen gaat altijd voor op de melding. */
export function EmergencyButton({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false)
  const [called112, setCalled112] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const report = async () => {
    setBusy(true)
    setError('')
    const pos = await currentPosition()
    const { error } = await supabase.rpc('report_incident', {
      p_game_id: gameId,
      p_lat: pos?.lat ?? null,
      p_lng: pos?.lng ?? null,
      p_called_112: called112,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setSent(true)
  }

  return (
    <>
      <button
        aria-label="Noodknop"
        onClick={() => setOpen(true)}
        className="fixed right-3 bottom-24 z-[2700] flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-2xl shadow-lg ring-2 ring-red-900/60 active:scale-95"
      >
        🆘
      </button>
      {open && (
        <div className="fixed inset-0 z-[3100] flex flex-col justify-end bg-slate-950/85 p-4">
          <div className="flex flex-col gap-3 rounded-2xl bg-slate-900 p-5 ring-1 ring-red-800">
            <h2 className="text-xl font-black text-red-400">Noodgeval?</h2>
            <p className="text-slate-200">Bij gevaar, letsel of een ongeluk: bel altijd eerst 112.</p>
            <a
              href="tel:112"
              onClick={() => setCalled112(true)}
              className="rounded-xl bg-red-600 px-4 py-4 text-center text-2xl font-black text-white active:scale-[0.98]"
            >
              📞 Bel 112
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => void report()}
              className="rounded-xl bg-slate-800 px-4 py-3 font-semibold text-slate-100 ring-1 ring-slate-700 disabled:opacity-40"
            >
              {busy ? 'Bezig…' : sent ? 'Nogmaals melden bij Boevenjacht' : 'Meld dit bij Boevenjacht'}
            </button>
            <ErrorLine>{error}</ErrorLine>
            {sent && <p className="text-sm text-emerald-300">Melding verstuurd naar de spelgroep en Boevenjacht.</p>}
            <button type="button" className="text-sm text-slate-400 underline" onClick={() => setOpen(false)}>
              Sluiten
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ErrorLine({ children }: { children: string }) {
  if (!children) return null
  return <p className="text-sm text-red-300">{children}</p>
}
