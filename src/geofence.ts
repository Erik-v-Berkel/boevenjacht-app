import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point, polygon } from '@turf/helpers'
import type { Feature, Polygon } from 'geojson'

/**
 * Client-side geofence check for instant player feedback (e.g. "je verlaat het speelgebied").
 * The server-side RPC re-checks with the same logic before accepting a scoring action —
 * this client check is a UX hint only, never the authoritative game-rule decision.
 */
export function isInsideRedLine(
  lat: number,
  lng: number,
  redLine: Feature<Polygon>,
): boolean {
  return booleanPointInPolygon(point([lng, lat]), redLine)
}

export function isInForbiddenZone(
  lat: number,
  lng: number,
  forbiddenZones: Feature<Polygon>[],
): boolean {
  const p = point([lng, lat])
  return forbiddenZones.some((zone) => booleanPointInPolygon(p, zone))
}

export function makeSquarePolygon(
  centerLng: number,
  centerLat: number,
  halfSideDegrees: number,
): Feature<Polygon> {
  return polygon([
    [
      [centerLng - halfSideDegrees, centerLat - halfSideDegrees],
      [centerLng + halfSideDegrees, centerLat - halfSideDegrees],
      [centerLng + halfSideDegrees, centerLat + halfSideDegrees],
      [centerLng - halfSideDegrees, centerLat + halfSideDegrees],
      [centerLng - halfSideDegrees, centerLat - halfSideDegrees],
    ],
  ])
}
