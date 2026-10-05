import { describe, expect, it } from 'vitest'
import { admin, newPhone, rpc, staffClient, startedGame } from './helpers'

describe('feedback (COP-74)', () => {
  it('speler kan feedback geven, staff leest het terug, buitenstaanders niet', async () => {
    const { game_id, players } = await startedGame()
    const boef = players[0].phone

    const res = await rpc<{ id: string; enjoyed: number }>(boef, 'submit_feedback', {
      p_game_id: game_id,
      p_enjoyed: 5,
      p_boring_moment: 'Wachten op de politie',
      p_winner_comment: 'Boeven wonnen op de klok',
      p_bug_report: '  ',
    })
    expect(res.enjoyed).toBe(5)

    const staff = await staffClient()
    const { data } = await staff.from('feedback').select('*').eq('game_id', game_id)
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({ enjoyed: 5, boring_moment: 'Wachten op de politie', bug_report: null })

    const buiten = await newPhone()
    const { data: viaBuiten, error } = await buiten.from('feedback').select('*').eq('game_id', game_id)
    expect(error).toBeNull()
    expect(viaBuiten).toEqual([])
  })

  it('opnieuw invullen overschrijft het vorige antwoord (geen dubbele rij)', async () => {
    const { game_id, players } = await startedGame()
    const boef = players[0].phone
    await rpc(boef, 'submit_feedback', { p_game_id: game_id, p_enjoyed: 2 })
    await rpc(boef, 'submit_feedback', { p_game_id: game_id, p_enjoyed: 4 })

    const { data } = await admin.from('feedback').select('*').eq('game_id', game_id)
    expect(data).toHaveLength(1)
    expect(data![0].enjoyed).toBe(4)
  })

  it('cijfer buiten 1-5: afgewezen', async () => {
    const { game_id, players } = await startedGame()
    await expect(rpc(players[0].phone, 'submit_feedback', { p_game_id: game_id, p_enjoyed: 9 })).rejects.toThrow(
      'Geef een cijfer van 1 tot 5',
    )
  })

  it('niet-speler kan geen feedback geven voor dit spel', async () => {
    const { game_id } = await startedGame()
    const buiten = await newPhone()
    await expect(rpc(buiten, 'submit_feedback', { p_game_id: game_id, p_enjoyed: 3 })).rejects.toThrow(
      'Je doet niet mee aan dit spel',
    )
  })
})
