import { describe, expect, it } from 'vitest'
import { admin, createGame, eventTypes, fullLobby, gameRow, joinedPhone, minutes, newPhone, rpc, teamsOf } from './helpers'

describe('start_game', () => {
  it('weigert te starten zolang niet alle teams een speler hebben', async () => {
    const { game_id, join_code } = await createGame()
    const [thieves, policeA] = await teamsOf(game_id)
    const a = await joinedPhone(join_code, 'A')
    await rpc(a.phone, 'choose_team', { p_game_id: game_id, p_team_id: thieves.id })
    const b = await joinedPhone(join_code, 'B')
    await rpc(b.phone, 'choose_team', { p_game_id: game_id, p_team_id: policeA.id })

    await expect(rpc(a.phone, 'start_game', { p_game_id: game_id })).rejects.toThrow('Nog geen spelers in: Polizei B, Polizei C')
    expect((await gameRow(game_id)).status).toBe('lobby')
  })

  it('weigert een speler zonder team en een buitenstaander', async () => {
    const { game_id, join_code } = await fullLobby()
    const zonderTeam = await joinedPhone(join_code, 'Zonder team')
    await expect(rpc(zonderTeam.phone, 'start_game', { p_game_id: game_id })).rejects.toThrow('Kies eerst een team')
    await expect(rpc(await newPhone(), 'start_game', { p_game_id: game_id })).rejects.toThrow('Kies eerst een team')
  })

  it('zet voorsprong (15 min) en eindtijd (15 + 180 min) vanaf T0', async () => {
    const { game_id, players } = await fullLobby()
    const before = Date.now()
    await rpc(players[2].phone, 'start_game', { p_game_id: game_id })

    const game = await gameRow(game_id)
    expect(game.status).toBe('headstart')
    expect(Math.abs(Date.parse(game.started_at) - before)).toBeLessThan(5_000)
    expect(minutes(game.started_at, game.police_start_at)).toBeCloseTo(15, 5)
    expect(minutes(game.started_at, game.ends_at)).toBeCloseTo(195, 5)
    expect(await eventTypes(game_id)).toEqual(['game_started'])
  })

  it('time_scale versnelt alle tijden (12 = 1 minuut in 5 seconden)', async () => {
    const { game_id, players } = await fullLobby({ time_scale: 12 })
    await rpc(players[0].phone, 'start_game', { p_game_id: game_id })
    const game = await gameRow(game_id)
    expect(minutes(game.started_at, game.police_start_at)).toBeCloseTo(15 / 12, 5)
    expect(minutes(game.started_at, game.ends_at)).toBeCloseTo(195 / 12, 5)
  })

  it('aftrek telt maximaal 120 minuten (plafond)', async () => {
    const { game_id, players } = await fullLobby()
    await admin.from('games').update({ bonus_total_min: 150 }).eq('id', game_id)
    await rpc(players[0].phone, 'start_game', { p_game_id: game_id })
    const game = await gameRow(game_id)
    expect(minutes(game.started_at, game.ends_at)).toBeCloseTo(195 - 120, 5)
  })

  it('alleen de eerste start telt, ook als iedereen tegelijk drukt', async () => {
    const { game_id, players } = await fullLobby()
    const results = await Promise.allSettled(players.map((p) => rpc(p.phone, 'start_game', { p_game_id: game_id })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    for (const r of results) if (r.status === 'rejected') expect(String(r.reason)).toContain('Het spel is al gestart')
    expect(await eventTypes(game_id)).toEqual(['game_started'])
  })
})

describe('tick_game', () => {
  it('verandert niets zolang de tijd niet om is', async () => {
    const { game_id, players } = await fullLobby()
    await rpc(players[0].phone, 'start_game', { p_game_id: game_id })
    const game = await rpc<{ status: string }>(players[1].phone, 'tick_game', { p_game_id: game_id })
    expect(game.status).toBe('headstart')
  })

  it('laat de politie vrij na de voorsprong en eindigt met winst voor de boeven bij 0', async () => {
    const { game_id, players } = await fullLobby({ time_scale: 600 }) // voorsprong 1,5 s, spel 19,5 s
    await rpc(players[0].phone, 'start_game', { p_game_id: game_id })
    const phone = players[3].phone

    await new Promise((r) => setTimeout(r, 1_700))
    expect((await rpc<{ status: string }>(phone, 'tick_game', { p_game_id: game_id })).status).toBe('running')

    // Klok vooruitzetten in plaats van 18 seconden wachten.
    await admin.from('games').update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq('id', game_id)
    const ended = await rpc<{ status: string; winner: string }>(phone, 'tick_game', { p_game_id: game_id })
    expect(ended).toMatchObject({ status: 'ended', winner: 'thieves' })

    await rpc(players[1].phone, 'tick_game', { p_game_id: game_id }) // nogmaals: geen dubbele events
    expect(await eventTypes(game_id)).toEqual(['game_started', 'police_released', 'game_ended'])
  })

  it('police_released en game_ended krijgen de exacte klokmomenten als tijdstip', async () => {
    const { game_id, players } = await fullLobby()
    await rpc(players[0].phone, 'start_game', { p_game_id: game_id })
    const past = (s: number) => new Date(Date.now() - s * 1000).toISOString()
    await admin.from('games').update({ police_start_at: past(60), ends_at: past(30) }).eq('id', game_id)
    await rpc(players[0].phone, 'tick_game', { p_game_id: game_id })

    const game = await gameRow(game_id)
    const { data: events } = await admin.from('events').select('type, created_at').eq('game_id', game_id).order('id')
    const at = (type: string) => Date.parse(events!.find((e) => e.type === type)!.created_at)
    expect(at('police_released')).toBe(Date.parse(game.police_start_at))
    expect(at('game_ended')).toBe(Date.parse(game.ends_at))
  })

  it('weigert buitenstaanders', async () => {
    const { game_id } = await fullLobby()
    await expect(rpc(await newPhone(), 'tick_game', { p_game_id: game_id })).rejects.toThrow('Je doet niet mee')
  })
})

describe('events en server_now', () => {
  it('events zijn alleen zichtbaar voor deelnemers', async () => {
    const { game_id, players } = await fullLobby()
    await rpc(players[0].phone, 'start_game', { p_game_id: game_id })
    const { data: mine } = await players[1].phone.from('events').select('type').eq('game_id', game_id)
    expect(mine).toHaveLength(1)
    const { data: theirs } = await (await newPhone()).from('events').select('type').eq('game_id', game_id)
    expect(theirs).toEqual([])
  })

  it('server_now geeft de servertijd', async () => {
    const t = await rpc<string>(await newPhone(), 'server_now', {})
    expect(Math.abs(Date.parse(t) - Date.now())).toBeLessThan(5_000)
  })
})
