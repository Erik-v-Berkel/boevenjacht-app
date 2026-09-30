import { describe, expect, it } from 'vitest'
import { admin, createGame, seedCity } from './helpers'

// COP-3: create_game met p_city_slug moet de rode lijn en bezienswaardigheden van het
// stadspakket (cities/city_points_of_interest) gebruiken in plaats van de Düsseldorf-sjabloon.

describe('create_game met p_city_slug', () => {
  it('gebruikt de rode lijn en bezienswaardigheden van het stadspakket', async () => {
    const city = await seedCity({
      slug: `testcity-${crypto.randomUUID().slice(0, 8)}`,
      redLineWkt: 'POLYGON((5.10 52.08, 5.14 52.08, 5.14 52.11, 5.10 52.11, 5.10 52.08))',
      pois: [
        { name: 'Domtoren', lat: 52.0907, lng: 5.1214, radiusM: 50 },
        { name: 'Neude', lat: 52.0928, lng: 5.1191 },
      ],
    })

    const { game_id } = await createGame({}, city.slug)

    const { data: game } = await admin.from('games').select('settings').eq('id', game_id).single()
    expect(game!.settings.play_area.type).toBe('Polygon')
    expect(game!.settings.play_area.coordinates[0]).toContainEqual([5.1, 52.08])

    const { data: sights } = await admin.from('sights').select('name, radius_m, sort').eq('game_id', game_id).order('sort')
    expect(sights!.map((s) => [s.name, s.radius_m])).toEqual([
      ['Domtoren', 50],
      ['Neude', 60], // default radius_m
    ])
  })

  it('weigert een onbekend stadspakket', async () => {
    await expect(createGame({}, 'onbestaande-stad-xyz')).rejects.toThrow('Onbekend of gearchiveerd stadspakket')
  })

  it('zonder p_city_slug blijft de Düsseldorf-sjabloon gebruiken (achterwaarts compatibel)', async () => {
    const { game_id } = await createGame()
    const { data: sights } = await admin.from('sights').select('name').eq('game_id', game_id).order('sort')
    expect(sights!.length).toBe(10)
    expect(sights![0].name).toBe('Burgplatz & Schlossturm')
  })
})
