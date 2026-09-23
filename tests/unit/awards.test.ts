import { describe, expect, it } from 'vitest'
import { computeAwards } from '../../src/lib/awards'
import { trackDistance, type Tracks } from '../../src/lib/trackMath'
import type { Photo, Player, Team } from '../../src/lib/types'

const T0 = Date.parse('2026-10-03T19:00:00Z')
const teams = [
  { id: 't0', role: 'thieves', name: 'Boeven' },
  { id: 't1', role: 'police', name: 'Polizei A' },
] as Team[]
const players = [
  { id: 'erik', name: 'Erik', team_id: 't0' },
  { id: 'anna', name: 'Anna', team_id: 't1' },
] as Player[]
// ± 111 m per 0,001 graad noorderbreedte
const walk = (n: number, step: number) => Array.from({ length: n }, (_, i) => ({ t: T0 + i * 10_000, lat: 51.22 + i * step, lng: 6.77 }))

describe('trackDistance', () => {
  it('telt GPS-ruis bij stilstaan niet mee', () => {
    const jitter = Array.from({ length: 50 }, (_, i) => ({ t: i, lat: 51.22 + (i % 2) * 0.00005, lng: 6.77 }))
    expect(trackDistance(jitter)).toBe(0)
    expect(trackDistance(walk(11, 0.001))).toBeCloseTo(1112, -1)
  })
})

describe('computeAwards', () => {
  it('geeft prijzen voor lopen, reacties, kroegen en de radar', () => {
    const tracks: Tracks = new Map([
      ['erik', walk(21, 0.001)],
      ['anna', walk(5, 0.001)],
    ])
    const beer = { id: 'f1', type: 'beer', player_id: 'erik', team_id: 't0' } as Photo
    const awards = computeAwards({
      players,
      teams,
      photos: [beer],
      reactions: [{ photo_id: 'f1', player_id: 'anna', game_id: 'g', emoji: '😂', active: true }],
      comments: [{ id: 1, photo_id: 'f1', player_id: 'anna', game_id: 'g', body: 'haha', created_at: '' }],
      pings: [{ id: 1, game_id: 'g', kind: 'radar', team_id: 't1', lat: 51.2205, lng: 6.77, radius_m: 300, age_s: 0, created_at: new Date(T0 + 50_000).toISOString() }],
      tracks,
      labels: { f1: 'Zum Uerige' },
    })
    const byTitle = Object.fromEntries(awards.map((a) => [a.title, a]))
    expect(byTitle.Wandelkampioen).toMatchObject({ winner: 'Erik', detail: '2,2 km' })
    expect(byTitle.Stilzitter.winner).toBe('Anna')
    expect(byTitle.Publiekslieveling).toMatchObject({ winner: 'Erik', detail: 'Zum Uerige: 2 reacties' })
    expect(byTitle.Kletskous.winner).toBe('Anna')
    expect(byTitle.Kroegtijger.winner).toBe('Erik')
    // Erik stond om T0+50s op 51.225: 4,5 × 111 m ≈ 500 m van het radarmidden
    expect(byTitle['Radar-Glückspilz'].winner).toBe('Polizei A')
    expect(byTitle['Controle-freak']).toBeUndefined()
  })

  it('zonder gegevens geen prijzen', () => {
    expect(computeAwards({ players, teams, photos: [], reactions: [], comments: [], pings: [], tracks: null, labels: {} })).toEqual([])
  })
})
