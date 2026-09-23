import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Wie heeft de app nu open? Via Realtime Presence: niets in de database, dus geen extra herlaadacties.
 * Gaat de app naar de achtergrond, dan meldt deze telefoon zich af.
 */
export function useOnline(gameId: string, playerId: string): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set([playerId]))

  useEffect(() => {
    const channel = supabase.channel(`online:${gameId}`, { config: { presence: { key: playerId } } })
    const track = () => void channel.track({ at: Date.now() })
    channel
      .on('presence', { event: 'sync' }, () => setOnline(new Set([playerId, ...Object.keys(channel.presenceState())])))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && document.visibilityState === 'visible') track()
      })
    const onVisibility = () => (document.visibilityState === 'visible' ? track() : void channel.untrack())
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [gameId, playerId])

  return online
}
