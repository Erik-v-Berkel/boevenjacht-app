import { describe, expect, it } from 'vitest'
import { admin, AT, eventTypes, newPhone, rpc, startedGame } from './helpers'

const loc = (gameId: string, at: readonly [number, number]) => ({ p_game_id: gameId, p_lat: at[0], p_lng: at[1], p_accuracy_m: 10 })

describe('live locaties boeven', () => {
  it('boeven zien elkaar, de politie en buitenstaanders zien niets', async () => {
    const { game_id, players, teams } = await startedGame()
    // tweede boef erbij
    const boef2 = await newPhone()
    const { data: u } = await boef2.auth.getUser()
    await admin.from('players').insert({ game_id, team_id: teams[0].id, user_id: u.user!.id, name: 'Boef 2' })

    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz))
    await rpc(boef2, 'update_location', loc(game_id, AT.uerige))

    const { data: zietBoef } = await players[0].phone.from('player_locations').select('lat').eq('game_id', game_id)
    expect(zietBoef).toHaveLength(2)
    for (const phone of [players[1].phone, players[3].phone, await newPhone()]) {
      const { data } = await phone.from('player_locations').select('lat').eq('game_id', game_id)
      expect(data).toEqual([])
    }
  })

  it('na het einde slaat niemand meer een locatie op', async () => {
    const { game_id, players } = await startedGame()
    await admin.from('games').update({ status: 'ended' }).eq('id', game_id)
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz))
    await rpc(players[1].phone, 'update_location', loc(game_id, AT.burgplatz))
    const { count } = await admin.from('player_locations').select('*', { count: 'exact', head: true }).eq('game_id', game_id)
    expect(count).toBe(0)
  })

  it('opnieuw sturen werkt de locatie bij', async () => {
    const { game_id, players } = await startedGame()
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz))
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.uerige))
    const { data } = await admin.from('player_locations').select('lat').eq('game_id', game_id)
    expect(data).toEqual([{ lat: AT.uerige[0] }])
  })
})

describe('live locaties Polizei (COP-83)', () => {
  it('Polizei-teams zien elkaar, maar niet de boeven', async () => {
    // players[0] = Boeven, players[1..3] = Politie A/B/C
    const { game_id, players } = await startedGame()
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz))
    await rpc(players[1].phone, 'update_location', loc(game_id, AT.uerige))
    await rpc(players[2].phone, 'update_location', loc(game_id, AT.lambertus))

    const { data: zietA } = await players[1].phone.from('player_locations').select('lat').eq('game_id', game_id)
    expect(zietA).toHaveLength(2) // zichzelf + Politie B, niet de boef

    const { data: zietB } = await players[2].phone.from('player_locations').select('lat').eq('game_id', game_id)
    expect(zietB).toHaveLength(2)

    // Politie C stuurde nog niets, maar ziet A en B wel al
    const { data: zietC } = await players[3].phone.from('player_locations').select('lat').eq('game_id', game_id)
    expect(zietC).toHaveLength(2)

    // De boef ziet alleen zichzelf, geen Polizei
    const { data: zietBoef } = await players[0].phone.from('player_locations').select('lat').eq('game_id', game_id)
    expect(zietBoef).toHaveLength(1)
  })
})

describe('buiten het speelveld (COP-84)', () => {
  it('boeven: iedereen krijgt 1 melding bij vertrek, geen herhaling zolang ze buiten blijven', async () => {
    const { game_id, players, teams } = await startedGame()
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz)) // binnen: geen melding
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.hbf)) // buiten: 1 melding
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.hbf)) // nog steeds buiten: geen 2e
    expect(await eventTypes(game_id)).toEqual(['game_started', 'out_of_bounds'])

    const { data } = await admin.from('events').select('payload').eq('game_id', game_id).eq('type', 'out_of_bounds').single()
    expect(data!.payload).toEqual({ team_id: teams[0].id }) // geen lat/lng: de locatie van de boeven blijft geheim
  })

  it('geldt ook voor een Polizei-team, en opnieuw zodra ze weer vertrekken', async () => {
    const { game_id, players } = await startedGame()
    await rpc(players[1].phone, 'update_location', loc(game_id, AT.hbf)) // Politie A buiten
    await rpc(players[1].phone, 'update_location', loc(game_id, AT.burgplatz)) // terug binnen: reset, geen melding
    await rpc(players[1].phone, 'update_location', loc(game_id, AT.hbf)) // weer buiten: 2e melding
    expect((await eventTypes(game_id)).filter((t) => t === 'out_of_bounds')).toHaveLength(2)
  })
})
