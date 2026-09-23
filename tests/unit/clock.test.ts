import { describe, expect, it } from 'vitest'
import { computeOffset, formatDuration, gameMinutesMs, needsTick, phaseAt } from '../../src/lib/clock'

const T0 = Date.parse('2026-10-03T19:00:00Z')
const game = {
  status: 'headstart' as const,
  police_start_at: new Date(T0 + 15 * 60_000).toISOString(),
  ends_at: new Date(T0 + 195 * 60_000).toISOString(),
  next_ping_at: null as string | null,
}

describe('phaseAt', () => {
  it('volgt de klok: voorsprong → zoeken → einde', () => {
    expect(phaseAt(game, T0 + 1)).toBe('headstart')
    expect(phaseAt(game, T0 + 15 * 60_000)).toBe('running')
    expect(phaseAt(game, T0 + 195 * 60_000 - 1)).toBe('running')
    expect(phaseAt(game, T0 + 195 * 60_000)).toBe('ended')
  })

  it('lobby en ended van de server zijn definitief', () => {
    expect(phaseAt({ ...game, status: 'lobby' }, T0 + 20 * 60_000)).toBe('lobby')
    expect(phaseAt({ ...game, status: 'ended' }, T0 + 1)).toBe('ended')
  })

  it('needsTick als de klok een grens is gepasseerd die de server nog niet kent', () => {
    expect(needsTick(game, T0 + 1)).toBe(false)
    expect(needsTick(game, T0 + 16 * 60_000)).toBe(true)
    expect(needsTick({ ...game, status: 'running' }, T0 + 16 * 60_000)).toBe(false)
    expect(needsTick({ ...game, status: 'running' }, T0 + 200 * 60_000)).toBe(true)
  })

  it('needsTick als er een ping gepland staat', () => {
    const running = { ...game, status: 'running' as const, next_ping_at: new Date(T0 + 45 * 60_000).toISOString() }
    expect(needsTick(running, T0 + 44 * 60_000)).toBe(false)
    expect(needsTick(running, T0 + 45 * 60_000)).toBe(true)
  })
})

describe('formatDuration', () => {
  it('toont uren alleen als nodig en rondt naar boven af', () => {
    expect(formatDuration(3 * 3600_000)).toBe('3:00:00')
    expect(formatDuration(15 * 60_000)).toBe('15:00')
    expect(formatDuration(12 * 60_000 + 34_000)).toBe('12:34')
    expect(formatDuration(5_001)).toBe('0:06')
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(-5_000)).toBe('0:00')
  })
})

describe('computeOffset', () => {
  it('neemt het monster met de kortste roundtrip en corrigeert voor de halve roundtrip', () => {
    const samples = [
      { sentAt: 1000, receivedAt: 1800, serverTime: 6000 }, // traag
      { sentAt: 2000, receivedAt: 2100, serverTime: 7050 }, // snel: server liep 5000 ms voor
    ]
    expect(computeOffset(samples)).toBe(5000)
    expect(computeOffset([])).toBe(0)
  })
})

describe('gameMinutesMs', () => {
  it('time_scale versnelt de tijd', () => {
    expect(gameMinutesMs(10, 1)).toBe(600_000)
    expect(gameMinutesMs(1, 12)).toBe(5_000)
  })
})

describe('timeAgo', () => {
  it('toont net, minuten en uren', async () => {
    const { timeAgo } = await import('../../src/lib/clock')
    const t = Date.parse('2026-10-03T20:00:00Z')
    expect(timeAgo('2026-10-03T19:59:30Z', t)).toBe('net')
    expect(timeAgo('2026-10-03T19:37:00Z', t)).toBe('23 min geleden')
    expect(timeAgo('2026-10-03T18:55:00Z', t)).toBe('1 u 5 min geleden')
  })
})
