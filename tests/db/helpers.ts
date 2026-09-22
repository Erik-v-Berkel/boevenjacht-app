import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Integratietests tegen de lokale Supabase (npm run db:start). De spelregels leven in Postgres,
// dus we testen de echte RPC's in plaats van een kopie van de logica in TypeScript.

interface LocalEnv {
  url: string
  anonKey: string
  serviceKey: string
}

function readLocalEnv(): LocalEnv {
  let status: Record<string, string>
  try {
    status = JSON.parse(execSync('npx --yes supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch {
    throw new Error('Lokale Supabase draait niet. Start hem eerst met: npm run db:start')
  }
  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY ?? status.PUBLISHABLE_KEY,
    serviceKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
  }
}

export const env = readLocalEnv()
export const ADMIN_CODE = 'test-admin' // zie supabase/seed.sql

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

/** Service-role client: omzeilt RLS, alleen om de testsituatie klaar te zetten. */
export const admin = createClient(env.url, env.serviceKey, noSession)

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

export async function createGame(settings: Record<string, unknown> = {}) {
  const creator = await newPhone()
  return rpc<{ game_id: string; join_code: string }>(creator, 'create_game', {
    p_admin_code: ADMIN_CODE,
    p_settings: settings,
  })
}

export async function teamsOf(gameId: string) {
  const { data, error } = await admin.from('teams').select('*').eq('game_id', gameId).order('sort')
  if (error) throw error
  return data as { id: string; name: string; role: string }[]
}

/** Nieuwe telefoon die met een naam aan het spel meedoet. */
export async function joinedPhone(joinCode: string, name: string) {
  const phone = await newPhone()
  const res = await rpc<{ game_id: string; player_id: string }>(phone, 'join_game', {
    p_join_code: joinCode,
    p_name: name,
  })
  return { phone, ...res }
}

/** Spel met in elk team één speler. Geeft de telefoons per team terug (0 = Boeven, 1-3 = Politie A-C). */
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
