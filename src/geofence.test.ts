import { describe, expect, it } from 'vitest'
import { isInForbiddenZone, isInsideRedLine, makeSquarePolygon } from './geofence'

describe('geofence (client-side feedback only, server RPC is authoritative)', () => {
  const redLine = makeSquarePolygon(5.1214, 52.0907, 0.02) // rond Utrecht Domtoren

  it('marks a point inside the rode lijn as inside', () => {
    expect(isInsideRedLine(52.0907, 5.1214, redLine)).toBe(true)
  })

  it('marks a point far outside the rode lijn as outside', () => {
    expect(isInsideRedLine(52.3702, 4.8952, redLine)).toBe(false) // Amsterdam
  })

  it('flags a point inside a verboden zone', () => {
    const forbiddenZone = makeSquarePolygon(5.1214, 52.0907, 0.005)
    expect(isInForbiddenZone(52.0907, 5.1214, [forbiddenZone])).toBe(true)
  })

  it('does not flag a point outside all verboden zones', () => {
    const forbiddenZone = makeSquarePolygon(5.1214, 52.0907, 0.005)
    expect(isInForbiddenZone(52.1, 5.2, [forbiddenZone])).toBe(false)
  })
})
