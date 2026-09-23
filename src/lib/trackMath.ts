import { distance } from '@turf/distance'
import { point } from '@turf/helpers'

export interface TrackPoint {
  t: number
  lat: number
  lng: number
}

export type Tracks = Map<string, TrackPoint[]> // player_id → punten, oudste eerst

export const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  distance(point([a.lng, a.lat]), point([b.lng, b.lat]), { units: 'meters' })

/** Laatste punt op of vóór t (binair zoeken). */
export function pointAt(track: TrackPoint[], t: number): TrackPoint | null {
  let lo = 0
  let hi = track.length - 1
  if (hi < 0 || track[0].t > t) return null
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (track[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return track[lo]
}

const MIN_STEP_M = 20 // GPS-ruis bij stilstaan niet meetellen

/** Gelopen afstand in meters: alleen stappen van minstens 20 m vanaf het laatst getelde punt. */
export function trackDistance(track: TrackPoint[]): number {
  let total = 0
  let anchor = track[0]
  for (const p of track.slice(1)) {
    const d = meters(anchor, p)
    if (d >= MIN_STEP_M) {
      total += d
      anchor = p
    }
  }
  return total
}
