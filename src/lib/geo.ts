import { booleanPointInPolygon, distance, point, pointToLineDistance, polygonToLine } from '@turf/turf'
import type { Feature, LineString, MultiLineString, Polygon } from 'geojson'
import type { Sight, SightGeometry } from './types'

// Geo-controles op de telefoon, alleen voor directe feedback. De server (PostGIS in submit_photo)
// beslist met dezelfde geometrieën en dezelfde regels.

export interface Position {
  lat: number
  lng: number
  accuracy: number
}

/** Afstand in meters van een positie tot een bezienswaardigheid (0 = erop/erin). */
export function distanceToGeometry(geometry: SightGeometry, lat: number, lng: number): number {
  const p = point([lng, lat])
  switch (geometry.type) {
    case 'Point':
      return distance(p, point(geometry.coordinates), { units: 'meters' })
    case 'LineString':
      return pointToLineDistance(p, geometry, { units: 'meters' })
    case 'Polygon': {
      if (booleanPointInPolygon(p, geometry)) return 0
      const outline = polygonToLine(geometry as Polygon) as Feature<LineString | MultiLineString>
      const lines = outline.geometry.type === 'LineString' ? [outline.geometry.coordinates] : outline.geometry.coordinates
      return Math.min(...lines.map((coords) => pointToLineDistance(p, { type: 'LineString', coordinates: coords }, { units: 'meters' })))
    }
  }
}

export function insidePlayArea(area: Polygon | undefined, lat: number, lng: number): boolean {
  return !area || booleanPointInPolygon(point([lng, lat]), area)
}

export type SightCheck =
  | { kind: 'ok'; sight: Sight; distance: number }
  | { kind: 'used'; sight: Sight }
  | { kind: 'inaccurate' }
  | { kind: 'none'; nearest: Sight | null; distance: number }

/** Zelfde keuze als de server: dichtstbijzijnde nog niet gebruikte bezienswaardigheid binnen de straal. */
export function checkSight(sights: Sight[], usedIds: Set<number>, pos: Position): SightCheck {
  const withDist = sights.map((sight) => ({ sight, d: distanceToGeometry(sight.geometry, pos.lat, pos.lng) }))
  const inRange = withDist
    .filter(({ sight, d }) => d <= sight.radius_m)
    .sort((a, b) => Number(usedIds.has(a.sight.id)) - Number(usedIds.has(b.sight.id)) || a.d - b.d)

  const best = inRange[0]
  if (!best) {
    if (pos.accuracy > 50) return { kind: 'inaccurate' }
    const nearest = withDist.filter(({ sight }) => !usedIds.has(sight.id)).sort((a, b) => a.d - b.d)[0]
    return { kind: 'none', nearest: nearest?.sight ?? null, distance: nearest?.d ?? Infinity }
  }
  if (usedIds.has(best.sight.id)) return { kind: 'used', sight: best.sight }
  if (pos.accuracy > Math.max(best.sight.radius_m, 30)) return { kind: 'inaccurate' }
  return { kind: 'ok', sight: best.sight, distance: best.d }
}
