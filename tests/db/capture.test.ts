import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, AT, eventTypes, gameRow, rpc, startedGame, submit, uploadPhoto, type PhotoResult } from './helpers'

async function capture(phone: SupabaseClient, gameId: string, path?: string) {
  return rpc<PhotoResult>(phone, 'submit_capture', {
    p_game_id: gameId,
    p_client_id: crypto.randomUUID(),
    p_storage_path: path ?? (await uploadPhoto(phone, gameId)),
    p_lat: AT.uerige[0],
    p_lng: AT.uerige[1],
    p_accuracy_m: 15,
  })
}

/** Gestart spel waarin de politie al mag zoeken. */
async function runningGame() {
  const game = await startedGame()
  await admin.from('games').update({ police_start_at: new Date(Date.now() - 1000).toISOString() }).eq('id', game.game_id)
  return game
}

describe('vangen', () => {
  it('een vangstfoto beëindigt het spel: politie wint, dit team is de winnaar', async () => {
    const { game_id, players, teams } = await runningGame()
    const res = await capture(players[2].phone, game_id)
    expect(res).toMatchObject({ status: 'accepted', label: 'Polizei B' })

    const game = await gameRow(game_id)
    expect(game).toMatchObject({ status: 'ended', winner: 'police', winning_team_id: teams[2].id })
    expect(Math.abs(Date.parse(game.ended_at) - Date.now())).toBeLessThan(5000)
    expect(await eventTypes(game_id)).toEqual(['game_started', 'police_released', 'capture', 'game_ended'])
  })

  it('alleen de eerste telt: de rest krijgt "Te laat, … was je voor" en staat wel in de galerij', async () => {
    const { game_id, players } = await runningGame()
    const paths = await Promise.all([1, 2, 3].map((i) => uploadPhoto(players[i].phone, game_id)))
    const results = await Promise.all([1, 2, 3].map((i, n) => capture(players[i].phone, game_id, paths[n])))

    const winners = results.filter((r) => r.status === 'accepted')
    expect(winners).toHaveLength(1)
    const winnerTeam = winners[0].label
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect(r.reject_reason).toBe(`Te laat, ${winnerTeam} was je voor.`)
    }
    // Iedereen (ook de boef) ziet alle 3 vangstfoto's
    const { data } = await players[0].phone.from('photos').select('status').eq('game_id', game_id).eq('type', 'capture')
    expect(data).toHaveLength(3)
    expect(await eventTypes(game_id)).toEqual(['game_started', 'police_released', 'capture', 'game_ended'])
  })

  it('tijdens de voorsprong kan de politie niet vangen', async () => {
    const { game_id, players } = await startedGame()
    await expect(capture(players[1].phone, game_id)).rejects.toThrow('De politie mag nog niet vertrekken')
    expect((await gameRow(game_id)).status).toBe('headstart')
  })

  it('boeven kunnen geen vangstfoto maken', async () => {
    const { game_id, players } = await runningGame()
    await expect(capture(players[0].phone, game_id)).rejects.toThrow('Alleen de politie')
  })

  it('na tijd op: afgewezen, boeven blijven winnaar', async () => {
    const { game_id, players } = await runningGame()
    await admin.from('games').update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq('id', game_id)
    const res = await capture(players[1].phone, game_id)
    expect(res.reject_reason).toBe('Het spel is voorbij, de boeven zijn ontsnapt.')
    const game = await gameRow(game_id)
    expect(game).toMatchObject({ status: 'ended', winner: 'thieves' })
    expect(Date.parse(game.ended_at)).toBe(Date.parse(game.ends_at))
  })

  it('een boevenfoto na de vangst wordt afgewezen', async () => {
    const { game_id, players } = await runningGame()
    await capture(players[1].phone, game_id)
    const res = await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })
    expect(res.reject_reason).toBe('Het spel is voorbij')
  })

  it('opnieuw versturen (zelfde client_id) geeft hetzelfde resultaat', async () => {
    const { game_id, players } = await runningGame()
    const phone = players[3].phone
    const args = {
      p_game_id: game_id, p_client_id: crypto.randomUUID(), p_storage_path: await uploadPhoto(phone, game_id),
      p_lat: null, p_lng: null, p_accuracy_m: null,
    }
    const a = await rpc<PhotoResult>(phone, 'submit_capture', args)
    const b = await rpc<PhotoResult>(phone, 'submit_capture', args)
    expect(b).toMatchObject({ photo_id: a.photo_id, status: 'accepted' })
  })
})
