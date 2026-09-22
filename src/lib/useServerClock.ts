import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { computeOffset, type ClockSample } from './clock'

/** Bepaalt het verschil tussen de klok van de telefoon en die van de server. */
export function useServerClock() {
  const [offset, setOffset] = useState(0)

  const sync = useCallback(async () => {
    const samples: ClockSample[] = []
    for (let i = 0; i < 3; i++) {
      const sentAt = Date.now()
      const { data, error } = await supabase.rpc('server_now')
      const receivedAt = Date.now()
      if (!error && typeof data === 'string') samples.push({ sentAt, receivedAt, serverTime: Date.parse(data) })
    }
    if (samples.length) setOffset(computeOffset(samples))
  }, [])

  useEffect(() => {
    void sync()
    const onVisible = () => document.visibilityState === 'visible' && void sync()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [sync])

  return offset
}

/** Huidige servertijd, elke `intervalMs` bijgewerkt. */
export function useServerNow(offset: number, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    setNow(Date.now() + offset)
    const id = setInterval(() => setNow(Date.now() + offset), intervalMs)
    return () => clearInterval(id)
  }, [offset, intervalMs])
  return now
}
