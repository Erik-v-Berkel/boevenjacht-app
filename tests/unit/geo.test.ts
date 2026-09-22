import { describe, expect, it } from 'vitest'
import type { Polygon } from 'geojson'
import { checkSight, distanceToGeometry, insidePlayArea } from '../../src/lib/geo'
import type { Sight } from '../../src/lib/types'

const sight = (id: number, name: string, geometry: Sight['geometry'], radius_m: number): Sight => ({
  id, game_id: 'g', name, geometry, radius_m, sort: id,
})

const burgplatz = sight(1, 'Burgplatz', { type: 'Point', coordinates: [6.7716, 51.2277] }, 75)
const koe = sight(5, 'Kö', { type: 'LineString', coordinates: [[6.7797, 51.2256], [6.779, 51.222], [6.7783, 51.2187]] }, 50)
const hofgarten = sight(7, 'Hofgarten', {
  type: 'Polygon',
  coordinates: [[[6.7775, 51.2275], [6.783, 51.2262], [6.788, 51.2275], [6.7895, 51.231], [6.785, 51.2335], [6.778, 51.234], [6.775, 51.231], [6.7775, 51.2275]]],
}, 20)
const sights = [burgplatz, koe, hofgarten]
const at = (lat: number, lng: number, accuracy = 10) => ({ lat, lng, accuracy })

describe('distanceToGeometry', () => {
  it('punt: ±111 m per 0,001 graad noorderbreedte', () => {
    expect(distanceToGeometry(burgplatz.geometry, 51.2287, 6.7716)).toBeCloseTo(111, -1)
  })
  it('lijn: afstand tot de dichtstbijzijnde plek op de lijn', () => {
    expect(distanceToGeometry(koe.geometry, 51.222, 6.7793)).toBeLessThan(30)
  })
  it('polygoon: 0 binnen, afstand tot de rand buiten', () => {
    expect(distanceToGeometry(hofgarten.geometry, 51.23, 6.782)).toBe(0)
    expect(distanceToGeometry(hofgarten.geometry, 51.2365, 6.782)).toBeGreaterThan(200)
  })
})

describe('checkSight', () => {
  it('kiest de bezienswaardigheid waar je staat', () => {
    const r = checkSight(sights, new Set(), at(51.2277, 6.7716))
    expect(r).toMatchObject({ kind: 'ok', sight: { name: 'Burgplatz' } })
  })
  it('al gebruikt', () => {
    expect(checkSight(sights, new Set([1]), at(51.2277, 6.7716))).toMatchObject({ kind: 'used', sight: { name: 'Burgplatz' } })
  })
  it('te ver weg: noemt de dichtstbijzijnde', () => {
    const r = checkSight(sights, new Set(), at(51.2245, 6.7765))
    expect(r.kind).toBe('none')
    if (r.kind === 'none') expect(r.nearest?.name).toBeDefined()
  })
  it('GPS te onnauwkeurig (accuracy groter dan de straal)', () => {
    expect(checkSight(sights, new Set(), at(51.2277, 6.7716, 90)).kind).toBe('inaccurate')
    expect(checkSight(sights, new Set(), at(51.2245, 6.7765, 80)).kind).toBe('inaccurate')
  })
})

describe('insidePlayArea', () => {
  const area: Polygon = { type: 'Polygon', coordinates: [[[6.77, 51.22], [6.78, 51.22], [6.78, 51.23], [6.77, 51.23], [6.77, 51.22]]] }
  it('binnen / buiten', () => {
    expect(insidePlayArea(area, 51.225, 6.775)).toBe(true)
    expect(insidePlayArea(area, 51.22, 6.794)).toBe(false)
  })
  it('zonder spelgebied: altijd binnen', () => {
    expect(insidePlayArea(undefined, 0, 0)).toBe(true)
  })
})
