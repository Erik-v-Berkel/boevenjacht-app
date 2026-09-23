import { describe, expect, it } from 'vitest'
import { distance } from '@turf/distance'
import { point } from '@turf/helpers'
import { admin, AT, createGame, eventTypes, gameRow, newPhone, rpc, startedGame, submit, teamsOf } from './helpers'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const inMin = (min: number) => new Date(Date.now() + min * 60_000).toISOString()
const loc = (gameId: string, at: readonly [number, number]) => ({ p_game_id: gameId, p_lat: at[0], p_lng: at[1], p_accuracy_m: 10 })

/** Gestart spel waarin de politie al `sinceMin` minuten zoekt. */
async function runningFor(sinceMin: number, endsInMin = 120) {
  const g = await startedGame()
  await admin
    .from('games')
    .update({ status: 'running', started_at: ago(sinceMin + 15), police_start_at: ago(sinceMin), ends_at: inMin(endsInMin) })
    .eq('id', g.game_id)
  return g
}

async function pingsOf(gameId: string) {
  const { data, error } = await admin.from('pings').select('*').eq('game_id', gameId).order('id')
  if (error) throw error
  return data
}

describe('pings', () => {
  it('na 30 min zonder foto komt er een ping in de buurt van de boeven', async () => {
    const { game_id, players } = await runningFor(31)
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz))
    await rpc(players[1].phone, 'tick_game', { p_game_id: game_id })

    const pings = await pingsOf(game_id)
    expect(pings).toHaveLength(1)
    expect(pings[0]).toMatchObject({ kind: 'idle', radius_m: 300 })
    const d = distance(point([AT.burgplatz[1], AT.burgplatz[0]]), point([pings[0].lng, pings[0].lat]), { units: 'meters' })
    expect(d).toBeLessThanOrEqual(181)
    expect(await eventTypes(game_id)).toContain('ping')

    // Volgende ping pas weer over 30 min; nog een tick doet niets
    const g = await gameRow(game_id)
    expect(Date.parse(g.next_ping_at) - Date.now()).toBeGreaterThan(29 * 60_000)
    await rpc(players[1].phone, 'tick_game', { p_game_id: game_id })
    expect(await pingsOf(game_id)).toHaveLength(1)
  })

  it('iedereen (ook de politie) ziet de ping, zonder de echte locatie', async () => {
    const { game_id, players } = await runningFor(31)
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz))
    await rpc(players[2].phone, 'tick_game', { p_game_id: game_id })
    const { data } = await players[3].phone.from('pings').select('lat, radius_m').eq('game_id', game_id)
    expect(data).toHaveLength(1)
  })

  it('zonder locatie wordt het een ping zonder signaal', async () => {
    const { game_id, players } = await runningFor(31)
    await rpc(players[1].phone, 'tick_game', { p_game_id: game_id })
    const pings = await pingsOf(game_id)
    expect(pings).toHaveLength(1)
    expect(pings[0].lat).toBeNull()
  })

  it('een bonusfoto zet de teller terug', async () => {
    const { game_id, players } = await runningFor(20)
    await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })
    const g = await gameRow(game_id)
    expect((Date.parse(g.next_ping_at) - Date.now()) / 60_000).toBeGreaterThan(29)
    expect(await pingsOf(game_id)).toHaveLength(0)
  })

  it('in de slotfase komt er minstens elke 10 minuten een ping', async () => {
    const { game_id, players } = await runningFor(60, 25)
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.uerige))
    await rpc(players[1].phone, 'tick_game', { p_game_id: game_id })
    const pings = await pingsOf(game_id)
    expect(pings.map((p) => p.kind)).toEqual(['final'])
    const g = await gameRow(game_id)
    expect((Date.parse(g.next_ping_at) - Date.now()) / 60_000).toBeCloseTo(10, 0)
  })

  it('tijdens de voorsprong geen pings', async () => {
    const { game_id, players } = await startedGame()
    await rpc(players[1].phone, 'tick_game', { p_game_id: game_id })
    expect(await pingsOf(game_id)).toHaveLength(0)
    expect((await gameRow(game_id)).next_ping_at).toBeNull()
  })
})

describe('radar', () => {
  it('één keer per politieteam; alleen dat team en de boeven zien de cirkel', async () => {
    const { game_id, players } = await runningFor(5)
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz))
    const ping = await rpc<{ kind: string; lat: number }>(players[1].phone, 'use_radar', { p_game_id: game_id })
    expect(ping.kind).toBe('radar')
    expect(ping.lat).not.toBeNull()

    await expect(rpc(players[1].phone, 'use_radar', { p_game_id: game_id })).rejects.toThrow('al gebruikt')
    await expect(rpc(players[0].phone, 'use_radar', { p_game_id: game_id })).rejects.toThrow('Alleen de Polizei')

    const sees = async (i: number) => (await players[i].phone.from('pings').select('id').eq('game_id', game_id)).data!.length
    expect(await sees(0)).toBe(1) // boef
    expect(await sees(1)).toBe(1) // Polizei A
    expect(await sees(2)).toBe(0) // Polizei B
  })

  it('de radar zet de automatische ping niet terug', async () => {
    const { game_id, players } = await runningFor(20)
    await rpc(players[2].phone, 'tick_game', { p_game_id: game_id })
    const before = (await gameRow(game_id)).next_ping_at
    expect(before).not.toBeNull()
    await rpc(players[2].phone, 'use_radar', { p_game_id: game_id })
    await rpc(players[2].phone, 'tick_game', { p_game_id: game_id })
    expect((await gameRow(game_id)).next_ping_at).toBe(before)
  })

  it('werkt niet tijdens de voorsprong', async () => {
    const { game_id, players } = await startedGame()
    await expect(rpc(players[1].phone, 'use_radar', { p_game_id: game_id })).rejects.toThrow('zoektijd')
  })
})

describe('replay', () => {
  it('iedereen komt in de geschiedenis, maar die is pas na het spel zichtbaar', async () => {
    const { game_id, players } = await startedGame()
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.burgplatz))
    await rpc(players[0].phone, 'update_location', loc(game_id, AT.uerige)) // binnen 10 s: overgeslagen
    await rpc(players[1].phone, 'update_location', loc(game_id, AT.koe))

    const { count } = await admin.from('location_history').select('*', { count: 'exact', head: true }).eq('game_id', game_id)
    expect(count).toBe(2)
    // politie staat niet in de live locaties
    const { count: live } = await admin.from('player_locations').select('*', { count: 'exact', head: true }).eq('game_id', game_id)
    expect(live).toBe(1)

    expect((await players[0].phone.from('location_history').select('id').eq('game_id', game_id)).data).toEqual([])
    await admin.from('games').update({ status: 'ended' }).eq('id', game_id)
    expect((await players[2].phone.from('location_history').select('id').eq('game_id', game_id)).data).toHaveLength(2)
  })
})

describe('reacties', () => {
  it('aan en uit zetten, alleen op zichtbare foto\'s', async () => {
    const { game_id, players } = await startedGame()
    const photo = await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })
    expect(await rpc(players[1].phone, 'toggle_reaction', { p_photo_id: photo.photo_id, p_emoji: '😂' })).toBe(true)
    expect(await rpc(players[2].phone, 'toggle_reaction', { p_photo_id: photo.photo_id, p_emoji: '😂' })).toBe(true)
    expect(await rpc(players[1].phone, 'toggle_reaction', { p_photo_id: photo.photo_id, p_emoji: '😂' })).toBe(false)

    const { data } = await players[3].phone.from('reactions').select('emoji, active').eq('game_id', game_id).eq('active', true)
    expect(data).toEqual([{ emoji: '😂', active: true }])

    await expect(rpc(players[1].phone, 'toggle_reaction', { p_photo_id: photo.photo_id, p_emoji: '💩' })).rejects.toThrow()
    const rejected = await submit(players[0].phone, game_id, { type: 'sight', at: AT.nergens })
    await expect(rpc(players[1].phone, 'toggle_reaction', { p_photo_id: rejected.photo_id, p_emoji: '😂' })).rejects.toThrow('Foto niet gevonden')
  })
})

describe('push', () => {
  it('slaat een abonnement op en werkt het bij voor hetzelfde endpoint', async () => {
    const { game_id, players } = await startedGame()
    const args = { p_game_id: game_id, p_endpoint: `https://push.example/${crypto.randomUUID()}`, p_p256dh: 'k', p_auth: 'a' }
    await rpc(players[1].phone, 'save_push_subscription', args)
    await rpc(players[1].phone, 'save_push_subscription', { ...args, p_auth: 'b' })
    const { data } = await admin.from('push_subscriptions').select('auth, player_id').eq('endpoint', args.p_endpoint)
    expect(data).toEqual([{ auth: 'b', player_id: players[1].player_id }])
    // Spelers kunnen de tabel zelf niet lezen
    expect((await players[1].phone.from('push_subscriptions').select('endpoint')).data).toEqual([])
  })
})

describe('aantal Polizei-teams', () => {
  it('maakt 1 tot 5 Polizei-teams', async () => {
    for (const n of [1, 5]) {
      const { game_id } = await createGame({ police_teams: n })
      const names = (await teamsOf(game_id)).map((t) => t.name)
      expect(names).toEqual(['Boeven', ...['A', 'B', 'C', 'D', 'E'].slice(0, n).map((l) => `Polizei ${l}`)])
    }
    await expect(createGame({ police_teams: 0 })).rejects.toThrow('1 tot 5')
    await expect(createGame({ police_teams: 6 })).rejects.toThrow('1 tot 5')
  })
})

describe('tekstreacties', () => {
  it('iedereen in het spel kan reageren en meelezen', async () => {
    const { game_id, players } = await startedGame()
    const photo = await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })
    const c = await rpc<{ body: string }>(players[1].phone, 'add_comment', { p_photo_id: photo.photo_id, p_body: '  We  komen eraan! ' })
    expect(c.body).toBe('We komen eraan!')
    await expect(rpc(players[1].phone, 'add_comment', { p_photo_id: photo.photo_id, p_body: 'nog een' })).rejects.toThrow('rustig')
    await expect(rpc(players[2].phone, 'add_comment', { p_photo_id: photo.photo_id, p_body: '   ' })).rejects.toThrow('1 tot 140')
    await expect(rpc(players[2].phone, 'add_comment', { p_photo_id: photo.photo_id, p_body: 'x'.repeat(141) })).rejects.toThrow('1 tot 140')

    const { data } = await players[0].phone.from('comments').select('body').eq('game_id', game_id)
    expect(data).toEqual([{ body: 'We komen eraan!' }])
    const { data: buiten } = await (await newPhone()).from('comments').select('body').eq('game_id', game_id)
    expect(buiten).toEqual([])
  })
})
