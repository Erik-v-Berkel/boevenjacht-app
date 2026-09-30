import { describe, expect, it } from 'vitest'
import { admin, createGame, eventTypes, joinedPhone, newPhone, rpc } from './helpers'

describe('join_game: akkoord op de veiligheidsverklaring', () => {
  it('weigert joinen zonder akkoord', async () => {
    const { game_id, join_code } = await createGame()
    const phone = await newPhone()
    await expect(rpc(phone, 'join_game', { p_join_code: join_code, p_name: 'Erik' })).rejects.toThrow('akkoord')
    await expect(
      rpc(phone, 'join_game', { p_join_code: join_code, p_name: 'Erik', p_consent: false }),
    ).rejects.toThrow('akkoord')
    const { data } = await admin.from('players').select('*').eq('game_id', game_id)
    expect(data).toEqual([])
  })

  it('legt het akkoord vast met tijdstip en versie', async () => {
    const { join_code } = await createGame()
    const before = Date.now()
    const { phone, player_id } = await joinedPhone(join_code, 'Erik')
    const { data } = await admin.from('players').select('*').eq('id', player_id).single()
    expect(data.consent_accepted_at).not.toBeNull()
    expect(Date.parse(data.consent_accepted_at)).toBeGreaterThanOrEqual(before - 1000)
    expect(data.consent_version).toBe('v1')
    expect(phone).toBeDefined()
  })

  it('kan geen speler aanmaken zonder akkoord, ook niet als de naam en code kloppen', async () => {
    const { game_id, join_code } = await createGame()
    const phone = await newPhone()
    await expect(rpc(phone, 'join_game', { p_join_code: join_code, p_name: 'Erik', p_consent: false })).rejects.toThrow()
    const { count } = await admin.from('players').select('*', { count: 'exact', head: true }).eq('game_id', game_id)
    expect(count).toBe(0)
  })
})

describe('report_incident: noodknop', () => {
  it('legt een noodmelding vast en zet die in de feed', async () => {
    const { game_id, join_code } = await createGame()
    const erik = await joinedPhone(join_code, 'Erik')

    const incident = await rpc<{ id: string; called_112: boolean }>(erik.phone, 'report_incident', {
      p_game_id: game_id,
      p_lat: 51.22,
      p_lng: 6.77,
      p_called_112: true,
    })
    expect(incident.called_112).toBe(true)

    const { data } = await admin.from('incidents').select('*').eq('id', incident.id).single()
    expect(data).toMatchObject({ game_id, player_id: erik.player_id, lat: 51.22, lng: 6.77, called_112: true })

    expect(await eventTypes(game_id)).toEqual(['incident'])
  })

  it('werkt ook zonder locatie en zonder dat 112 al gebeld is', async () => {
    const { game_id, join_code } = await createGame()
    const erik = await joinedPhone(join_code, 'Erik')
    const incident = await rpc<{ id: string; lat: number | null; called_112: boolean }>(erik.phone, 'report_incident', {
      p_game_id: game_id,
    })
    expect(incident.lat).toBeNull()
    expect(incident.called_112).toBe(false)
  })

  it('weigert een melding van iemand die niet meedoet', async () => {
    const { game_id } = await createGame()
    const buitenstaander = await newPhone()
    await expect(rpc(buitenstaander, 'report_incident', { p_game_id: game_id })).rejects.toThrow('Je doet niet mee')
  })

  it('alleen deelnemers van het spel kunnen de noodmelding lezen', async () => {
    const { game_id, join_code } = await createGame()
    const erik = await joinedPhone(join_code, 'Erik')
    await rpc(erik.phone, 'report_incident', { p_game_id: game_id })

    const buitenstaander = await newPhone()
    const { data: outsider } = await buitenstaander.from('incidents').select('*').eq('game_id', game_id)
    expect(outsider).toEqual([])

    const { data: mine } = await erik.phone.from('incidents').select('*').eq('game_id', game_id)
    expect(mine).toHaveLength(1)
  })
})
