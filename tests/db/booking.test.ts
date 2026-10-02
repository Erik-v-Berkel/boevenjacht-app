import { describe, expect, it } from 'vitest'
import { admin, newPhone, rpc, seedCity, teamsOf } from './helpers'

// COP-5: boeken en betalen. submit_booking() (20260930000003) levert een 'pending' boeking op;
// fulfil_booking_payment() is wat de Mollie-webhook (supabase/functions/mollie-webhook) aanroept
// met de service-role-key nadat de betaalstatus rechtstreeks bij Mollie is opgehaald.

async function bookGo(city: { slug: string }, participantCount = 6) {
  const buyer = await newPhone()
  return rpc<{ id: string; status: string; price_cents_total: number }>(buyer, 'submit_booking', {
    p_city_slug: city.slug,
    p_product_slug: 'go',
    p_participant_count: participantCount,
    p_contact_name: 'Erik',
    p_contact_email: 'erik@example.com',
    p_locale: 'nl',
  })
}

describe('submit_booking', () => {
  it('maakt een pending boeking met server-berekende prijs', async () => {
    const city = await seedCity({
      slug: `testcity-${crypto.randomUUID().slice(0, 8)}`,
      redLineWkt: 'POLYGON((5.10 52.08, 5.14 52.08, 5.14 52.11, 5.10 52.11, 5.10 52.08))',
    })
    const booking = await bookGo(city, 6)
    expect(booking.status).toBe('pending')
    expect(booking.price_cents_total).toBeGreaterThan(0)
  })
})

describe('fulfil_booking_payment', () => {
  it('maakt bij status paid een spel aan met het stadspakket en bevestigt de boeking', async () => {
    const city = await seedCity({
      slug: `testcity-${crypto.randomUUID().slice(0, 8)}`,
      redLineWkt: 'POLYGON((5.10 52.08, 5.14 52.08, 5.14 52.11, 5.10 52.11, 5.10 52.08))',
      pois: [{ name: 'Domtoren', lat: 52.0907, lng: 5.1214 }],
    })
    const booking = await bookGo(city, 6)

    const result = await rpc<{ status: string; game_id: string; join_code: string }>(admin, 'fulfil_booking_payment', {
      p_booking_id: booking.id,
      p_mollie_payment_id: 'tr_test123',
      p_mollie_status: 'paid',
    })

    expect(result.status).toBe('confirmed')
    expect(result.join_code).toMatch(/^[A-Z]{4}\d{2}$/)

    const { data: game } = await admin.from('games').select('id').eq('id', result.game_id).single()
    expect(game).not.toBeNull()

    const teams = await teamsOf(result.game_id)
    expect(teams.filter((t) => t.role === 'thieves')).toHaveLength(1)
    expect(teams.filter((t) => t.role === 'police')).toHaveLength(1) // 6 deelnemers -> 1 Polizei-team

    const { data: sights } = await admin.from('sights').select('name').eq('game_id', result.game_id)
    expect(sights!.map((s) => s.name)).toEqual(['Domtoren'])
  })

  it('geeft meer Polizei-teams bij meer deelnemers, geclamped op 5', async () => {
    const city = await seedCity({
      slug: `testcity-${crypto.randomUUID().slice(0, 8)}`,
      redLineWkt: 'POLYGON((5.10 52.08, 5.14 52.08, 5.14 52.11, 5.10 52.11, 5.10 52.08))',
    })
    const booking = await bookGo(city, 18)
    const result = await rpc<{ game_id: string }>(admin, 'fulfil_booking_payment', {
      p_booking_id: booking.id,
      p_mollie_payment_id: 'tr_test_max',
      p_mollie_status: 'paid',
    })
    const teams = await teamsOf(result.game_id)
    expect(teams.filter((t) => t.role === 'police')).toHaveLength(5)
  })

  it('zet de boeking op cancelled bij een mislukte/verlopen betaling, zonder spel aan te maken', async () => {
    const city = await seedCity({
      slug: `testcity-${crypto.randomUUID().slice(0, 8)}`,
      redLineWkt: 'POLYGON((5.10 52.08, 5.14 52.08, 5.14 52.11, 5.10 52.11, 5.10 52.08))',
    })
    const booking = await bookGo(city)
    const result = await rpc<{ status: string; game_id: string | null }>(admin, 'fulfil_booking_payment', {
      p_booking_id: booking.id,
      p_mollie_payment_id: 'tr_expired',
      p_mollie_status: 'expired',
    })
    expect(result.status).toBe('cancelled')
    expect(result.game_id).toBeNull()
  })

  it('is idempotent: een tweede melding voor dezelfde boeking maakt geen tweede spel', async () => {
    const city = await seedCity({
      slug: `testcity-${crypto.randomUUID().slice(0, 8)}`,
      redLineWkt: 'POLYGON((5.10 52.08, 5.14 52.08, 5.14 52.11, 5.10 52.11, 5.10 52.08))',
    })
    const booking = await bookGo(city)
    const first = await rpc<{ game_id: string }>(admin, 'fulfil_booking_payment', {
      p_booking_id: booking.id,
      p_mollie_payment_id: 'tr_dup',
      p_mollie_status: 'paid',
    })
    const second = await rpc<{ game_id: string }>(admin, 'fulfil_booking_payment', {
      p_booking_id: booking.id,
      p_mollie_payment_id: 'tr_dup',
      p_mollie_status: 'paid',
    })
    expect(second.game_id).toBe(first.game_id)
  })

  it('is niet uitvoerbaar met een anonieme sessie (alleen de service-role/webhook mag dit)', async () => {
    const city = await seedCity({
      slug: `testcity-${crypto.randomUUID().slice(0, 8)}`,
      redLineWkt: 'POLYGON((5.10 52.08, 5.14 52.08, 5.14 52.11, 5.10 52.11, 5.10 52.08))',
    })
    const booking = await bookGo(city)
    const outsider = await newPhone()
    await expect(
      rpc(outsider, 'fulfil_booking_payment', {
        p_booking_id: booking.id,
        p_mollie_payment_id: 'tr_hack',
        p_mollie_status: 'paid',
      }),
    ).rejects.toThrow()
  })
})

describe('get_booking_status', () => {
  it('geeft status en spelcode terug zonder contactgegevens, ook voor een anonieme sessie', async () => {
    const city = await seedCity({
      slug: `testcity-${crypto.randomUUID().slice(0, 8)}`,
      redLineWkt: 'POLYGON((5.10 52.08, 5.14 52.08, 5.14 52.11, 5.10 52.11, 5.10 52.08))',
    })
    const booking = await bookGo(city)
    await rpc(admin, 'fulfil_booking_payment', {
      p_booking_id: booking.id,
      p_mollie_payment_id: 'tr_status_check',
      p_mollie_status: 'paid',
    })

    const outsider = await newPhone()
    const [row] = await rpc<{ status: string; join_code: string }[]>(outsider, 'get_booking_status', {
      p_booking_id: booking.id,
    })
    expect(row.status).toBe('confirmed')
    expect(row.join_code).toMatch(/^[A-Z]{4}\d{2}$/)
  })
})
