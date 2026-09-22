import { dismiss, retryNow, type QueueItem } from '../lib/uploadQueue'
import { Button } from './ui'

/** Status van één foto in de uploadwachtrij: "Wordt verstuurd…" / "Verstuurd ✓ −10 min" / afgewezen. */
export function UploadStatus({ item, onBack }: { item: QueueItem | undefined; onBack: () => void }) {
  if (!item) return null

  if (item.state === 'pending' || item.state === 'sending') {
    return (
      <div className="mt-10 flex flex-col gap-4 text-center">
        <p className="text-6xl">📤</p>
        <p className="text-2xl font-bold">Wordt verstuurd…</p>
        {item.attempts > 0 && (
          <>
            <p className="text-slate-400">
              Geen of slecht bereik. De foto staat veilig op je telefoon en we blijven het proberen (poging {item.attempts + 1}).
            </p>
            <Button variant="secondary" onClick={retryNow}>
              Nu opnieuw proberen
            </Button>
          </>
        )}
        <Button variant="secondary" onClick={onBack}>
          Verder (versturen gaat door)
        </Button>
      </div>
    )
  }

  const back = () => {
    void dismiss(item.clientId)
    onBack()
  }

  if (item.state === 'failed') {
    return (
      <div className="mt-10 flex flex-col gap-4 text-center">
        <p className="text-6xl">⚠️</p>
        <p className="text-2xl font-bold">Niet gelukt</p>
        <p className="text-slate-300">{item.error}</p>
        <Button onClick={back}>Terug</Button>
      </div>
    )
  }

  const r = item.result!
  return (
    <div className="mt-10 flex flex-col gap-4 text-center">
      {r.status === 'accepted' ? (
        item.kind === 'capture' ? (
          <>
            <p className="text-6xl">🚓</p>
            <p className="text-2xl font-bold">Boeven gevangen!</p>
          </>
        ) : (
          <>
            <p className="text-6xl">✅</p>
            <p className="text-2xl font-bold">Verstuurd ✓ −{r.bonus_min} min</p>
            <p className="text-slate-400">{r.label}</p>
            {r.bonus_min === 0 && <p className="text-slate-400">Maximale aftrek was al bereikt.</p>}
          </>
        )
      ) : (
        <>
          <p className="text-6xl">❌</p>
          <p className="text-2xl font-bold">{item.kind === 'capture' ? 'Niet geteld' : 'Afgewezen'}</p>
          <p className="text-slate-300">{r.reject_reason}</p>
        </>
      )}
      <Button onClick={back}>Terug</Button>
    </div>
  )
}

/** Kort overzicht van foto's die nog onderweg zijn (bv. bij slecht bereik). */
export function PendingUploads({ items }: { items: QueueItem[] }) {
  const pending = items.filter((i) => i.state === 'pending' || i.state === 'sending')
  if (pending.length === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm ring-1 ring-slate-700">
      <span>
        📤 {pending.length} foto{pending.length > 1 ? "'s" : ''} nog onderweg
        {pending.some((i) => i.attempts > 0) && ' (slecht bereik)'}
      </span>
      <button className="text-yellow-400 underline" onClick={retryNow}>
        Opnieuw
      </button>
    </div>
  )
}
