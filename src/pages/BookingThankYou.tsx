import { useEffect, useState } from 'react'
import { fetchBookingStatus } from '../lib/stadspakketten'
import { joinLink } from '../lib/joinCode'

// Landt hier na terugkomst van de Mollie-checkout (zie redirectUrl in
// supabase/functions/_shared/molliePayment.ts). De webhook die de boeking echt bevestigt, loopt
// los van deze pagina — Mollie kan de klant hierheen sturen voordat de webhook is afgerond.
// Daarom pollen we even op get_booking_status() in plaats van alleen op de redirect te vertrouwen.
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 90_000

type Phase = 'wachten' | 'bevestigd' | 'mislukt' | 'timeout' | 'fout'

export function BookingThankYou({ bookingId }: { bookingId: string }) {
  const [phase, setPhase] = useState<Phase>('wachten')
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()

    async function poll() {
      try {
        const { status, joinCode: code } = await fetchBookingStatus(bookingId)
        if (cancelled) return
        if (status === 'confirmed') {
          setJoinCode(code)
          setPhase('bevestigd')
          return
        }
        if (status === 'cancelled') {
          setPhase('mislukt')
          return
        }
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setPhase('timeout')
          return
        }
        setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Onbekende fout')
        setPhase('fout')
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [bookingId])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 text-center text-neutral-100">
      {phase === 'wachten' && (
        <>
          <h1 className="text-xl font-bold">We controleren je betaling…</h1>
          <p className="text-neutral-400">Dit duurt meestal een paar seconden.</p>
        </>
      )}

      {phase === 'bevestigd' && joinCode && (
        <>
          <h1 className="text-xl font-bold">Betaling gelukt 🚓</h1>
          <p className="text-neutral-300">Jullie spel staat klaar. We hebben de join-link ook gemaild.</p>
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Spelcode</p>
            <p className="font-mono text-4xl font-black tracking-widest text-amber-400">{joinCode}</p>
          </div>
          <a href={joinLink(location.origin, joinCode)} className="rounded-lg bg-amber-400 p-3 font-semibold text-neutral-900">
            Zelf meedoen
          </a>
        </>
      )}

      {phase === 'mislukt' && (
        <>
          <h1 className="text-xl font-bold">Betaling niet gelukt</h1>
          <p className="text-neutral-400">Er is niets afgeschreven. Probeer het opnieuw.</p>
          <a href="/boeken" className="text-amber-400 underline">
            Terug naar boeken
          </a>
        </>
      )}

      {phase === 'timeout' && (
        <>
          <h1 className="text-xl font-bold">Dit duurt langer dan verwacht</h1>
          <p className="text-neutral-400">
            Check zo je e-mail voor de join-link, of neem contact op als je niets ontvangt.
          </p>
        </>
      )}

      {phase === 'fout' && (
        <p className="text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
