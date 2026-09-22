import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Position } from './geo'

export type GeoState =
  | { kind: 'waiting' }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; pos: Position; fake: boolean }

// Nep-GPS voor thuis testen (PLAN.md §10.2). Alleen actief met ?dev=1 in de URL en alleen in
// testspellen (time_scale ≠ 1) of bij lokaal ontwikkelen.
let fake: Position | null = null
const listeners = new Set<() => void>()

export function devModeAllowed(timeScale: number): boolean {
  return new URLSearchParams(location.search).has('dev') && (timeScale !== 1 || import.meta.env.DEV)
}

export function setFakePosition(pos: Position | null) {
  fake = pos
  listeners.forEach((l) => l())
}

function useFakePosition() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => fake,
  )
}

/** Volgt de GPS-positie zolang het component op het scherm staat. */
export function useGeolocation(devAllowed = false): GeoState {
  const [state, setState] = useState<GeoState>({ kind: 'waiting' })
  const fakePos = useFakePosition()

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState({ kind: 'unavailable' })
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) =>
        setState({
          kind: 'ok',
          fake: false,
          pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy },
        }),
      (err) => setState(err.code === err.PERMISSION_DENIED ? { kind: 'denied' } : { kind: 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  if (devAllowed && fakePos) return { kind: 'ok', pos: fakePos, fake: true }
  return state
}
