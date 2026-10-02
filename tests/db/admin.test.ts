import { describe, expect, it } from 'vitest'
import { admin, AT, eventTypes, fullLobby, gameRow, minutes, newPhone, rpc, staffClient, startedGame, submit } from './helpers'

// COP-6: beheerscherm. De RPC's zelf zijn de enige plek waar deze acties mogen gebeuren
// (geen directe table-writes vanuit de client), dus we testen ze net als de speler-RPC's.

describe('is_staff / RLS: beheer ziet alles, spelers alleen hun eigen spel', () => {
  it('een speler kan admin_game_summary niet gebruiken om andere spellen te zien', async () => {
    const { game_id: gameA } = await startedGame()
    const { game_id: gameB, players } = await startedGame()

    const { data, error } = await players[0].phone.from('admin_game_summary').select('*').eq('id', gameA)
    expect(error).toBeNull()
    expect(data).toEqual([]) // RLS filtert 'm weg, geen foutmelding

    const { data: own } = await players[0].phone.from('admin_game_summary').select('*').eq('id', gameB)
    expect(own).toHaveLength(1)
  })

  it('staff ziet elk spel in admin_game_summary, met de juiste tellingen', async () => {
    const { game_id, players } = await startedGame({ time_scale: 1000 }) // voorsprong 0,9 s, spel 11,7 s
    await new Promise((r) => setTimeout(r, 1_000)) // wacht tot de voorsprong voorbij is
    await submit(players[0].phone, game_id, { type: 'beer', at: AT.uerige, bar: 'Uerige' }) // submit_photo synct de klok
    const staff = await staffClient()

    const { data, error } = await staff.from('admin_game_summary').select('*').eq('id', game_id).single()
    expect(error).toBeNull()
    expect(data).toMatchObject({ id: game_id, status: 'running', player_count: 4, accepted_photo_count: 1, rejected_photo_count: 0 })
  })

  it('een speler krijgt geen toegang tot de beheer-RPC\'s', async () => {
    const { game_id, players } = await startedGame()
    await expect(
      rpc(players[0].phone, 'admin_stop_game', { p_game_id: game_id, p_reason: 'test' }),
    ).rejects.toThrow('Alleen beheer')
  })

  it('een buitenstaander zonder sessie krijgt ook geen toegang', async () => {
    const { game_id } = await startedGame()
    const outsider = await newPhone()
    await expect(rpc(outsider, 'admin_stop_game', { p_game_id: game_id })).rejects.toThrow('Alleen beheer')
  })
})

describe('admin_set_ends_at: eindtijd aanpassen', () => {
  it('staff kan de eindtijd tijdens de zoektijd aanpassen; gelogd en zichtbaar in de feed', async () => {
    const { game_id } = await startedGame()
    const staff = await staffClient()
    const newEndsAt = new Date(Date.now() + 5 * 60_000).toISOString()

    const updated = await rpc<{ ends_at: string }>(staff, 'admin_set_ends_at', {
      p_game_id: game_id,
      p_ends_at: newEndsAt,
      p_reason: 'Test: eerder klaar',
    })
    // Postgres/PostgREST geeft timestamptz terug als '...+00:00', Date.toISOString() eindigt op 'Z':
    // zelfde tijdstip, andere string-notatie, dus vergelijken via de numerieke waarde.
    expect(Date.parse(updated.ends_at)).toBe(Date.parse(newEndsAt))

    const game = await gameRow(game_id)
    expect(Date.parse(game.ends_at)).toBe(Date.parse(newEndsAt))
    expect(await eventTypes(game_id)).toEqual(['game_started', 'admin_action'])

    const { data: log } = await admin.from('admin_actions').select('*').eq('game_id', game_id).single()
    expect(log).toMatchObject({ action: 'end_time_changed', payload: { reason: 'Test: eerder klaar' } })
    expect(Date.parse((log as any).payload.new_ends_at)).toBe(Date.parse(newEndsAt))
  })

  it('weigert een spel dat nog in de lobby staat', async () => {
    const { game_id } = await fullLobby()
    const staff = await staffClient()
    await expect(
      rpc(staff, 'admin_set_ends_at', { p_game_id: game_id, p_ends_at: new Date().toISOString() }),
    ).rejects.toThrow('alleen aan te passen')
  })
})

describe('admin_reject_photo: foto afkeuren', () => {
  it('draait de aftrek terug en schuift de eindtijd weer op', async () => {
    const { game_id, players } = await startedGame()
    const before = await gameRow(game_id)
    const res = await submit(players[0].phone, game_id, { type: 'beer', at: AT.uerige, bar: 'Uerige' })
    const afterBonus = await gameRow(game_id)
    expect(afterBonus.bonus_total_min).toBe(10)

    const staff = await staffClient()
    const rejected = await rpc<{ status: string; reject_reason: string }>(staff, 'admin_reject_photo', {
      p_photo_id: res.photo_id,
      p_reason: 'Geen bier zichtbaar',
    })
    expect(rejected).toMatchObject({ status: 'rejected', reject_reason: 'Geen bier zichtbaar' })

    const after = await gameRow(game_id)
    expect(after.bonus_total_min).toBe(0)
    expect(minutes(before.started_at, after.ends_at)).toBeCloseTo(minutes(before.started_at, before.ends_at), 5)
    expect(await eventTypes(game_id)).toEqual(['game_started', 'bonus', 'admin_action'])
  })

  it('weigert een al afgekeurde foto nogmaals af te keuren', async () => {
    const { game_id, players } = await startedGame()
    const res = await submit(players[0].phone, game_id, { type: 'beer', at: AT.hbf, bar: 'Buiten het veld' })
    expect(res.status).toBe('rejected')

    const staff = await staffClient()
    await expect(rpc(staff, 'admin_reject_photo', { p_photo_id: res.photo_id })).rejects.toThrow('al afgekeurd')
  })

  it('weigert een vangstfoto af te keuren', async () => {
    const { game_id, players } = await startedGame({ time_scale: 1000 }) // voorsprong 0,9 s, spel 11,7 s
    await new Promise((r) => setTimeout(r, 1_000)) // wacht tot de voorsprong voorbij is: politie mag pas dan vangen
    const path = `${game_id}/${crypto.randomUUID()}.jpg`
    await players[1].phone.storage
      .from('photos')
      .upload(path, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    const capture = await rpc<{ photo_id: string; status: string }>(players[1].phone, 'submit_capture', {
      p_game_id: game_id,
      p_client_id: crypto.randomUUID(),
      p_storage_path: path,
      p_lat: AT.burgplatz[0],
      p_lng: AT.burgplatz[1],
      p_accuracy_m: 10,
    })
    expect(capture.status).toBe('accepted')

    const staff = await staffClient()
    await expect(rpc(staff, 'admin_reject_photo', { p_photo_id: capture.photo_id })).rejects.toThrow('vangstfoto')
  })
})

describe('admin_stop_game: spel stoppen', () => {
  it('beëindigt het spel zonder winnaar en logt de actie', async () => {
    const { game_id } = await startedGame()
    const staff = await staffClient()

    const stopped = await rpc<{ status: string; winner: string | null }>(staff, 'admin_stop_game', {
      p_game_id: game_id,
      p_reason: 'Onweer',
    })
    expect(stopped).toMatchObject({ status: 'ended', winner: null })

    const game = await gameRow(game_id)
    expect(game.status).toBe('ended')
    expect(game.winner).toBeNull()
    expect(game.ended_at).not.toBeNull()
    expect(await eventTypes(game_id)).toEqual(['game_started', 'game_ended'])

    const { data: log } = await admin.from('admin_actions').select('*').eq('game_id', game_id).single()
    expect(log).toMatchObject({ action: 'game_stopped', payload: { reason: 'Onweer' } })
  })

  it('weigert een spel dat al voorbij is nogmaals te stoppen', async () => {
    const { game_id } = await startedGame()
    const staff = await staffClient()
    await rpc(staff, 'admin_stop_game', { p_game_id: game_id })
    await expect(rpc(staff, 'admin_stop_game', { p_game_id: game_id })).rejects.toThrow('al voorbij')
  })
})
