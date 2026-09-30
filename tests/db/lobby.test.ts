import { describe, expect, it } from 'vitest'
import { admin, createGame, joinedPhone, newPhone, rpc, teamsOf } from './helpers'

describe('create_game', () => {
  it('weigert een onjuiste beheerderscode', async () => {
    const phone = await newPhone()
    await expect(rpc(phone, 'create_game', { p_admin_code: 'fout' })).rejects.toThrow('Onjuiste beheerderscode')
  })

  it('maakt een spel met join-code, standaardinstellingen en 4 teams', async () => {
    const { game_id, join_code } = await createGame()
    expect(join_code).toMatch(/^[A-Z]{4}\d{2}$/)

    const { data: game } = await admin.from('games').select('*').eq('id', game_id).single()
    expect(game.status).toBe('lobby')
    expect(game.settings).toMatchObject({
      headstart_min: 15,
      search_min: 180,
      beer_bonus_min: 10,
      sight_bonus_min: 15,
      cooldown_min: 10,
      max_bonus_total_min: 120,
      bonus_during_headstart: true,
      max_players_per_team: 3,
      time_scale: 1,
    })

    const teams = await teamsOf(game_id)
    expect(teams.map((t) => [t.name, t.role])).toEqual([
      ['Boeven', 'thieves'],
      ['Polizei A', 'police'],
      ['Polizei B', 'police'],
      ['Polizei C', 'police'],
    ])
  })

  it('neemt alleen bekende instellingen over', async () => {
    const { game_id } = await createGame({ time_scale: 12, onzin: 1 })
    const { data: game } = await admin.from('games').select('settings').eq('id', game_id).single()
    expect(game!.settings.time_scale).toBe(12)
    expect(game!.settings).not.toHaveProperty('onzin')
  })
})

describe('join_game', () => {
  it('weigert een onbekende code en een lege naam', async () => {
    const phone = await newPhone()
    await expect(rpc(phone, 'join_game', { p_join_code: 'XXXX00', p_name: 'Erik', p_consent: true })).rejects.toThrow('Onbekende spelcode')
    const { join_code } = await createGame()
    await expect(rpc(phone, 'join_game', { p_join_code: join_code, p_name: '   ', p_consent: true })).rejects.toThrow('Vul een naam in')
  })

  it('accepteert de code met kleine letters en spaties', async () => {
    const { game_id, join_code } = await createGame()
    const code = `${join_code.slice(0, 4).toLowerCase()} ${join_code.slice(4)}`
    const res = await joinedPhone(code, 'Erik')
    expect(res.game_id).toBe(game_id)
  })

  it('weigert een naam die al in gebruik is (hoofdletterongevoelig)', async () => {
    const { join_code } = await createGame()
    await joinedPhone(join_code, 'Erik')
    await expect(joinedPhone(join_code, 'erik')).rejects.toThrow('Deze naam is al in gebruik')
  })

  it('geeft dezelfde speler terug bij opnieuw meedoen (herladen)', async () => {
    const { join_code } = await createGame()
    const first = await joinedPhone(join_code, 'Erik')
    const again = await rpc<{ player_id: string }>(first.phone, 'join_game', { p_join_code: join_code, p_name: 'Erik V' })
    expect(again.player_id).toBe(first.player_id)
    const { data } = await admin.from('players').select('name').eq('id', first.player_id).single()
    expect(data!.name).toBe('Erik V')
  })

  it('laat na de start geen nieuwe spelers toe, maar wel bestaande', async () => {
    const { game_id, join_code } = await createGame()
    const erik = await joinedPhone(join_code, 'Erik')
    await admin.from('games').update({ status: 'headstart' }).eq('id', game_id)

    await expect(joinedPhone(join_code, 'Laatkomer')).rejects.toThrow('Dit spel is al begonnen')
    const again = await rpc<{ player_id: string }>(erik.phone, 'join_game', { p_join_code: join_code, p_name: 'Erik' })
    expect(again.player_id).toBe(erik.player_id)
  })
})

describe('choose_team', () => {
  it('zet een speler in een team en laat wisselen toe', async () => {
    const { game_id, join_code } = await createGame()
    const [thieves, policeA] = await teamsOf(game_id)
    const erik = await joinedPhone(join_code, 'Erik')

    await rpc(erik.phone, 'choose_team', { p_game_id: game_id, p_team_id: thieves.id })
    await rpc(erik.phone, 'choose_team', { p_game_id: game_id, p_team_id: policeA.id })
    const { data } = await admin.from('players').select('team_id').eq('id', erik.player_id).single()
    expect(data!.team_id).toBe(policeA.id)

    await rpc(erik.phone, 'choose_team', { p_game_id: game_id, p_team_id: null })
    const { data: after } = await admin.from('players').select('team_id').eq('id', erik.player_id).single()
    expect(after!.team_id).toBeNull()
  })

  it('een team is vol bij 3 spelers', async () => {
    const { game_id, join_code } = await createGame()
    const [thieves] = await teamsOf(game_id)
    for (const name of ['A', 'B', 'C']) {
      const p = await joinedPhone(join_code, name)
      await rpc(p.phone, 'choose_team', { p_game_id: game_id, p_team_id: thieves.id })
    }
    const vierde = await joinedPhone(join_code, 'D')
    await expect(rpc(vierde.phone, 'choose_team', { p_game_id: game_id, p_team_id: thieves.id })).rejects.toThrow('Dit team is vol')
  })

  it('bij 6 gelijktijdige aanvragen komen er precies 3 in het team (row lock)', async () => {
    const { game_id, join_code } = await createGame()
    const [, , policeB] = await teamsOf(game_id)
    const phones = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map((n) => joinedPhone(join_code, n)))

    const results = await Promise.allSettled(
      phones.map((p) => rpc(p.phone, 'choose_team', { p_game_id: game_id, p_team_id: policeB.id })),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
    const { count } = await admin.from('players').select('*', { count: 'exact', head: true }).eq('team_id', policeB.id)
    expect(count).toBe(3)
  })

  it('weigert een team uit een ander spel', async () => {
    const game1 = await createGame()
    const game2 = await createGame()
    const [otherTeam] = await teamsOf(game2.game_id)
    const erik = await joinedPhone(game1.join_code, 'Erik')
    await expect(rpc(erik.phone, 'choose_team', { p_game_id: game1.game_id, p_team_id: otherTeam.id })).rejects.toThrow('Onbekend team')
  })

  it('weigert wisselen na de start en voor niet-deelnemers', async () => {
    const { game_id, join_code } = await createGame()
    const [thieves] = await teamsOf(game_id)
    const buitenstaander = await newPhone()
    await expect(rpc(buitenstaander, 'choose_team', { p_game_id: game_id, p_team_id: thieves.id })).rejects.toThrow('Je doet niet mee')

    const erik = await joinedPhone(join_code, 'Erik')
    await admin.from('games').update({ status: 'running' }).eq('id', game_id)
    await expect(rpc(erik.phone, 'choose_team', { p_game_id: game_id, p_team_id: thieves.id })).rejects.toThrow('al begonnen')
  })
})

describe('Row Level Security', () => {
  it('alleen deelnemers kunnen het spel, de teams en de spelers lezen', async () => {
    const { game_id, join_code } = await createGame()
    await joinedPhone(join_code, 'Erik')
    const buitenstaander = await newPhone()

    for (const [table, col] of [['games', 'id'], ['teams', 'game_id'], ['players', 'game_id']] as const) {
      const { data } = await buitenstaander.from(table).select('*').eq(col, game_id)
      expect(data, table).toEqual([])
    }

    const lid = await joinedPhone(join_code, 'Lid')
    const { data: players } = await lid.phone.from('players').select('name').eq('game_id', game_id)
    expect(players!.map((p) => p.name).sort()).toEqual(['Erik', 'Lid'])
  })

  it('deelnemers kunnen niet rechtstreeks schrijven', async () => {
    const { game_id, join_code } = await createGame()
    const erik = await joinedPhone(join_code, 'Erik')

    await erik.phone.from('games').update({ status: 'ended', winner: 'thieves' }).eq('id', game_id)
    const { data: game } = await admin.from('games').select('status').eq('id', game_id).single()
    expect(game!.status).toBe('lobby')

    const { error } = await erik.phone.from('players').insert({ game_id, user_id: crypto.randomUUID(), name: 'Nep' })
    expect(error).not.toBeNull()
  })
})
