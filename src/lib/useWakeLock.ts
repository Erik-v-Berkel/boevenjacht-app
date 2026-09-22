import { useEffect } from 'react'

/** Houdt het scherm aan zolang `active` (Screen Wake Lock API; wordt stilletjes overgeslagen als het niet kan). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request('screen')
        if (cancelled) void l.release()
        else lock = l
      } catch {
        // bv. batterijbesparing: niet erg
      }
    }
    // Het slot vervalt als de app naar de achtergrond gaat: opnieuw aanvragen bij terugkomst.
    const onVisible = () => document.visibilityState === 'visible' && void acquire()
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
