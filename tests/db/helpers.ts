import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ENV_FILE } from '../setup/supabaseEnv'
import { fetchWithClockRetry } from '../../src/lib/fetchRetry'

// Integratietests tegen de lokale Supabase (npm run db:start). De spelregels leven in Postgres,
// dus we testen de echte RPC's in plaats van een kopie van de logica in TypeScript.

interface LocalEnv {
  url: string
  anonKey: string
  serviceKey: string
}

function readLocalEnv(): LocalEnv {
  const status = JSON.parse(readFileSync(ENV_FILE, 'utf8')) as Record<string, string>
  if (!status.API_URL) throw new Error('Lokale Supabase draait niet. Start hem eerst met: npm run db:start')
  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY ?? status.PUBLISHABLE_KEY,
    serviceKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
  }
}

export const env = readLocalEnv()
export const ADMIN_CODE = 'test-admin' // zie supabase/seed.sql

const noSession = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchWithClockRetry } }

/** Service-role client: omzeilt RLS, alleen om de testsituatie klaar te zetten. */
export const admin = createClient(env.url, env.serviceKey, noSession)

/** Nieuw staff-account (e-mail/wachtwoord, geen anonieme sessie) en ingelogde client; zie
 * src/lib/staffAuth.ts en 20260930000007_admin_panel.sql (public.is_staff()). */
export async function staffClient(): Promise<SupabaseClient> {
  const email = `staff-${crypto.randomUUID()}@test.local`
  const password = 'test-wachtwoord-123'
  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createError) throw createError
  const client = createClient(env.url, env.anonKey, noSession)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

/** Een nieuwe "telefoon": eigen anonieme sessie. */
export async function newPhone(): Promise<SupabaseClient> {
  const client = createClient(env.url, env.anonKey, noSession)
  const { error } = await client.auth.signInAnonymously()
  if (error) throw error
  return client
}

/** Voert een RPC uit en gooit bij een fout, zodat tests leesbaar blijven. */
export async function rpc<T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function createGame(settings: Record<string, unknown> = {}, citySlug?: string) {
  const creator = await newPhone()
  return rpc<{ game_id: string; join_code: string }>(creator, 'create_game', {
    p_admin_code: ADMIN_CODE,
    p_settings: settings,
    p_city_slug: citySlug ?? null,
  })
}

/** Zet een stadspakket (cities + city_points_of_interest) klaar voor city-driven testspellen. */
export async function seedCity(opts: {
  slug: string
  status?: 'draft' | 'active' | 'archived'
  /** WKT-polygoon zonder SRID-prefix, bv. 'POLYGON((5.12 52.09, 5.13 52.09, 5.13 52.10, 5.12 52.09))'. */
  redLineWkt: string
  pois?: { name: string; lat: number; lng: number; radiusM?: number }[]
}) {
  const { data: city, error } = await admin
    .from('cities')
    .insert({
      slug: opts.slug,
      name: opts.slug,
      theme: 'test',
      status: opts.status ?? 'active',
      red_line: `SRID=4326;${opts.redLineWkt}`,
    })
    .select()
    .single()
  if (error) throw error

  for (const [i, poi] of (opts.pois ?? []).entries()) {
    const { error: poiError } = await admin.from('city_points_of_interest').insert({
      city_id: city.id,
      kind: 'bezienswaardigheid',
      name_nl: poi.name,
      location: `SRID=4326;POINT(${poi.lng} ${poi.lat})`,
      radius_m: poi.radiusM ?? 60,
      sort_order: i,
    })
    if (poiError) throw poiError
  }
  return city as { id: string; slug: string }
}

export async function teamsOf(gameId: string) {
  const { data, error } = await admin.from('teams').select('*').eq('game_id', gameId).order('sort')
  if (error) throw error
  return data as { id: string; name: string; role: string }[]
}

/** Nieuwe telefoon die met een naam aan het spel meedoet (met akkoord op de veiligheidsverklaring). */
export async function joinedPhone(joinCode: string, name: string) {
  const phone = await newPhone()
  const res = await rpc<{ game_id: string; player_id: string }>(phone, 'join_game', {
    p_join_code: joinCode,
    p_name: name,
    p_consent: true,
    p_consent_version: 'v1',
  })
  return { phone, ...res }
}

/** Spel met in elk team één speler. Geeft de telefoons per team terug (0 = Boeven, 1-3 = Polizei A-C). */
export async function fullLobby(settings: Record<string, unknown> = {}) {
  const { game_id, join_code } = await createGame(settings)
  const teams = await teamsOf(game_id)
  const players = await Promise.all(
    teams.map(async (team) => {
      const p = await joinedPhone(join_code, team.name)
      await rpc(p.phone, 'choose_team', { p_game_id: game_id, p_team_id: team.id })
      return { ...p, team }
    }),
  )
  return { game_id, join_code, teams, players }
}

export async function gameRow(gameId: string) {
  const { data, error } = await admin.from('games').select('*').eq('id', gameId).single()
  if (error) throw error
  return data
}

export async function eventTypes(gameId: string) {
  const { data, error } = await admin.from('events').select('type').eq('game_id', gameId).order('id')
  if (error) throw error
  return data.map((e) => e.type as string)
}

export const minutes = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000

/** Gestart spel; players[0] is de boef. */
export async function startedGame(settings: Record<string, unknown> = {}) {
  const lobby = await fullLobby(settings)
  await rpc(lobby.players[0].phone, 'start_game', { p_game_id: lobby.game_id })
  return lobby
}

/** Uploadt een (nep)foto naar Storage en geeft het pad terug. */
export async function uploadPhoto(phone: SupabaseClient, gameId: string) {
  const path = `${gameId}/${crypto.randomUUID()}.jpg`
  const { error } = await phone.storage
    .from('photos')
    .upload(path, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}

export interface PhotoResult {
  photo_id: string
  status: 'accepted' | 'rejected'
  reject_reason?: string
  bonus_min: number
  label?: string
  ends_at?: string
}

export const AT = {
  burgplatz: [51.2277, 6.7716],
  lambertus: [51.2289, 6.7729],
  koe: [51.222, 6.7793], // ±20 m van de lijn over de Kö
  hofgarten: [51.23, 6.782], // binnen de parkpolygoon
  uerige: [51.2263, 6.774],
  schumacher: [51.2256, 6.7743],
  hbf: [51.22, 6.794], // Hauptbahnhof: buiten het speelveld
  nergens: [51.2245, 6.7765], // in het speelveld, niet bij een bezienswaardigheid
} as const

/** Uploadt en registreert een foto. */
export async function submit(
  phone: SupabaseClient,
  gameId: string,
  opts: { type: 'beer' | 'sight'; at: readonly [number, number]; accuracy?: number; bar?: string; clientId?: string; path?: string },
) {
  const path = opts.path ?? (await uploadPhoto(phone, gameId))
  return rpc<PhotoResult>(phone, 'submit_photo', {
    p_game_id: gameId,
    p_client_id: opts.clientId ?? crypto.randomUUID(),
    p_type: opts.type,
    p_storage_path: path,
    p_lat: opts.at[0],
    p_lng: opts.at[1],
    p_accuracy_m: opts.accuracy ?? 10,
    p_bar_name: opts.bar ?? null,
  })
}

/** Wachttijd overslaan: alle foto's van het spel 11 minuten terugzetten. */
export async function skipCooldown(gameId: string) {
  const { error } = await admin
    .from('photos')
    .update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() })
    .eq('game_id', gameId)
  if (error) throw error
}
