import { describe, expect, it } from 'vitest'
import { normalizeBarName } from '../../src/lib/barName'
import {
  admin, AT, eventTypes, fullLobby, gameRow, minutes, newPhone, rpc, skipCooldown, startedGame, submit, uploadPhoto,
} from './helpers'

describe('bierfoto', () => {
  it('geeft −10 min, schuift de eindtijd op en komt in de feed', async () => {
    const { game_id, players } = await startedGame()
    const res = await submit(players[0].phone, game_id, { type: 'beer', at: AT.uerige, bar: 'Zum Uerige' })
    expect(res).toMatchObject({ status: 'accepted', bonus_min: 10, label: 'Zum Uerige' })

    const game = await gameRow(game_id)
    expect(game.bonus_total_min).toBe(10)
    expect(minutes(game.started_at, game.ends_at)).toBeCloseTo(195 - 10, 5)
    expect(await eventTypes(game_id)).toEqual(['game_started', 'bonus'])
  })

  it('dezelfde kroeg (na normaliseren) telt maar 1×', async () => {
    const { game_id, players } = await startedGame()
    const boef = players[0].phone
    await submit(boef, game_id, { type: 'beer', at: AT.uerige, bar: 'Zum Uerige' })
    await skipCooldown(game_id)
    const res = await submit(boef, game_id, { type: 'beer', at: AT.schumacher, bar: 'Brauerei uerige!' })
    expect(res).toMatchObject({ status: 'rejected', reject_reason: 'Deze kroeg is al gebruikt' })
  })

  it('binnen 30 m van een eerdere bierfoto: afgewezen, behalve bij onnauwkeurige GPS', async () => {
    const { game_id, players } = await startedGame()
    const boef = players[0].phone
    await submit(boef, game_id, { type: 'beer', at: AT.uerige, bar: 'Uerige' })
    await skipCooldown(game_id)

    const tienMeterVerder = [AT.uerige[0] + 0.00009, AT.uerige[1]] as const
    const res = await submit(boef, game_id, { type: 'beer', at: tienMeterVerder, bar: 'Andere naam' })
    expect(res.reject_reason).toBe('Deze kroeg is al gebruikt (volgens je locatie)')

    const binnen = await submit(boef, game_id, { type: 'beer', at: tienMeterVerder, accuracy: 80, bar: 'Andere naam' })
    expect(binnen.status).toBe('accepted')
  })

  it('zonder kroegnaam: afgewezen', async () => {
    const { game_id, players } = await startedGame()
    const res = await submit(players[0].phone, game_id, { type: 'beer', at: AT.uerige, bar: '  !! ' })
    expect(res.reject_reason).toBe('Vul de naam van de kroeg in')
  })
})

describe('bezienswaardigheid', () => {
  it('kiest de bezienswaardigheid waar je staat en geeft −15 min', async () => {
    const { game_id, players } = await startedGame()
    const res = await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })
    expect(res).toMatchObject({ status: 'accepted', bonus_min: 15, label: 'Burgplatz & Schlossturm' })
  })

  it('werkt ook bij een lijn (Kö) en een polygoon (Hofgarten)', async () => {
    const { game_id, players } = await startedGame()
    expect((await submit(players[0].phone, game_id, { type: 'sight', at: AT.koe })).label).toBe('Königsallee (Kö)')
    await skipCooldown(game_id)
    expect((await submit(players[0].phone, game_id, { type: 'sight', at: AT.hofgarten })).label).toBe('Hofgarten')
  })

  it('elke bezienswaardigheid telt 1×', async () => {
    const { game_id, players } = await startedGame()
    await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })
    await skipCooldown(game_id)
    const res = await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })
    expect(res.reject_reason).toBe('Burgplatz & Schlossturm is al gebruikt')
  })

  it('te ver weg of GPS te onnauwkeurig: afgewezen', async () => {
    const { game_id, players } = await startedGame()
    const boef = players[0].phone
    expect((await submit(boef, game_id, { type: 'sight', at: AT.nergens })).reject_reason).toBe('Je bent niet bij een bezienswaardigheid')
    expect((await submit(boef, game_id, { type: 'sight', at: AT.lambertus, accuracy: 120 })).reject_reason).toBe(
      'GPS nog niet nauwkeurig genoeg, even wachten…',
    )
  })
})

describe('algemene regels', () => {
  it('wachttijd van 10 minuten voor het hele team', async () => {
    const { game_id, join_code, players, teams } = await startedGame()
    await submit(players[0].phone, game_id, { type: 'beer', at: AT.uerige, bar: 'Uerige' })

    // tweede boef uit hetzelfde team (toevoegen via admin, want het spel is al gestart)
    const tweede = await newPhone()
    const { data: user } = await tweede.auth.getUser()
    await admin.from('players').insert({ game_id, team_id: teams[0].id, user_id: user.user!.id, name: 'Boef 2' })
    void join_code

    const res = await submit(tweede, game_id, { type: 'sight', at: AT.burgplatz })
    expect(res.status).toBe('rejected')
    expect(res.reject_reason).toMatch(/^Wachttijd actief: nog (9:5\d|10:00)$/)
  })

  it('buiten het speelveld of zonder GPS: afgewezen', async () => {
    const { game_id, players } = await startedGame()
    expect((await submit(players[0].phone, game_id, { type: 'beer', at: AT.hbf, bar: 'Bahnhof' })).reject_reason).toBe(
      'Je bent buiten het speelveld',
    )
    const path = await uploadPhoto(players[0].phone, game_id)
    const res = await rpc<{ reject_reason: string }>(players[0].phone, 'submit_photo', {
      p_game_id: game_id, p_client_id: crypto.randomUUID(), p_type: 'beer', p_storage_path: path,
      p_lat: null, p_lng: null, p_accuracy_m: null, p_bar_name: 'Uerige',
    })
    expect(res.reject_reason).toMatch(/^Geen GPS-locatie/)
  })

  it('foto tijdens de voorsprong telt mee', async () => {
    const { game_id, players } = await startedGame()
    expect((await gameRow(game_id)).status).toBe('headstart')
    expect((await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })).bonus_min).toBe(15)
  })

  it('plafond: alleen de resterende minuten, daarna 0 (maar wel geplaatst)', async () => {
    const { game_id, players } = await startedGame()
    await admin.from('games').update({ bonus_total_min: 115 }).eq('id', game_id)

    expect((await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz })).bonus_min).toBe(5)
    await skipCooldown(game_id)
    const na = await submit(players[0].phone, game_id, { type: 'beer', at: AT.uerige, bar: 'Uerige' })
    expect(na).toMatchObject({ status: 'accepted', bonus_min: 0 })

    const game = await gameRow(game_id)
    expect(game.bonus_total_min).toBe(120)
    expect(minutes(game.started_at, game.ends_at)).toBeCloseTo(195 - 120, 5)
    expect(await eventTypes(game_id)).toEqual(['game_started', 'bonus', 'bonus_cap_reached', 'bonus'])
  })

  it('na het einde: afgewezen', async () => {
    const { game_id, players } = await startedGame()
    await admin.from('games').update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq('id', game_id)
    const res = await submit(players[0].phone, game_id, { type: 'beer', at: AT.uerige, bar: 'Uerige' })
    expect(res.reject_reason).toBe('Het spel is voorbij')
    expect((await gameRow(game_id)).status).toBe('ended')
  })

  it('twee foto\'s tegelijk: de eerste telt, de tweede krijgt de wachttijd', async () => {
    const { game_id, players } = await startedGame()
    const boef = players[0].phone
    const paths = await Promise.all([uploadPhoto(boef, game_id), uploadPhoto(boef, game_id)])
    const results = await Promise.all([
      submit(boef, game_id, { type: 'sight', at: AT.burgplatz, path: paths[0] }),
      submit(boef, game_id, { type: 'beer', at: AT.uerige, bar: 'Uerige', path: paths[1] }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['accepted', 'rejected'])
    expect(results.find((r) => r.status === 'rejected')!.reject_reason).toMatch(/^Wachttijd actief/)
  })

  it('opnieuw versturen met dezelfde client_id telt niet dubbel', async () => {
    const { game_id, players } = await startedGame()
    const clientId = crypto.randomUUID()
    const path = await uploadPhoto(players[0].phone, game_id)
    const a = await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz, clientId, path })
    const b = await submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz, clientId, path })
    expect(b).toMatchObject({ photo_id: a.photo_id, status: 'accepted', bonus_min: 15 })
    expect((await gameRow(game_id)).bonus_total_min).toBe(15)
  })

  it('politie kan geen bonusfoto maken; foto moet in de opslag staan', async () => {
    const { game_id, players } = await startedGame()
    await expect(submit(players[1].phone, game_id, { type: 'sight', at: AT.burgplatz })).rejects.toThrow('Alleen boeven')
    await expect(
      submit(players[0].phone, game_id, { type: 'sight', at: AT.burgplatz, path: `${game_id}/bestaat-niet.jpg` }),
    ).rejects.toThrow('Foto niet gevonden')
  })
})

describe('zichtbaarheid', () => {
  it('iedereen ziet geaccepteerde foto\'s; een afgewezen foto alleen de maker', async () => {
    const { game_id, players } = await startedGame()
    const boef = players[0].phone
    const politie = players[1].phone
    await submit(boef, game_id, { type: 'sight', at: AT.burgplatz })
    await submit(boef, game_id, { type: 'sight', at: AT.lambertus }) // wachttijd → afgewezen

    const { data: zietPolitie } = await politie.from('photos').select('status').eq('game_id', game_id)
    expect(zietPolitie!.map((p) => p.status)).toEqual(['accepted'])
    const { data: zietBoef } = await boef.from('photos').select('status').eq('game_id', game_id)
    expect(zietBoef!.map((p) => p.status).sort()).toEqual(['accepted', 'rejected'])
  })

  it('foto\'s en bezienswaardigheden zijn niet zichtbaar voor buitenstaanders', async () => {
    const { game_id, players } = await startedGame()
    const path = await uploadPhoto(players[0].phone, game_id)
    const buiten = await newPhone()

    const { data: sights } = await buiten.from('sights').select('*').eq('game_id', game_id)
    expect(sights).toEqual([])
    const { error } = await buiten.storage.from('photos').download(path)
    expect(error).not.toBeNull()
    await expect(uploadPhoto(buiten, game_id)).rejects.toThrow()

    const { data: blob } = await players[2].phone.storage.from('photos').download(path)
    expect(blob?.size).toBe(4)
  })

  it('een nieuw spel krijgt de 10 bezienswaardigheden en het spelgebied', async () => {
    const { game_id, players } = await fullLobby()
    const { data } = await players[0].phone.from('sights').select('name').eq('game_id', game_id).order('sort')
    expect(data).toHaveLength(10)
    expect((await gameRow(game_id)).settings.play_area.type).toBe('Polygon')
  })
})

describe('kroegnamen normaliseren', () => {
  const cases: [string, string][] = [
    ['Zum Uerige', 'uerige'],
    ['Brauerei Zum Uerige', 'uerige'],
    ['Im Füchschen', 'fuchschen'],
    ['Brauerei im Füchschen!', 'fuchschen'],
    ['Schlüssel', 'schlussel'],
    ['Zum Schlüssel', 'schlussel'],
    ['Brauhaus Schumacher', 'schumacher'],
    ['Kürzer', 'kurzer'],
    ['Die Straße', 'strasse'],
    ['Café Müller', 'muller'],
    ['Bar', 'bar'],
    ['Zum Schiffchen ', 'schiffchen'],
    ['Früh am Dom', 'fruhdom'],
    ['   ', ''],
  ]

  it.each(cases)('%s → %s (TypeScript)', (input, expected) => {
    expect(normalizeBarName(input)).toBe(expected)
  })

  it('Postgres geeft precies hetzelfde als TypeScript', async () => {
    const phone = await newPhone()
    for (const [input, expected] of cases) {
      expect(await rpc(phone, 'normalize_bar_name', { p_name: input }), input).toBe(expected)
    }
  })
})
