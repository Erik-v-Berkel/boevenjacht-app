// Capaciteitstest (COP-10, backlogpunt 9): 6 spellen van 18 spelers tegelijk (108 totaal),
// met nep-GPS-coördinaten en een snelle klok (settings.time_scale), tegen de echte RPC's.
//
// De spelregels en tijdberekening draaien server-side met een row lock per spel (AGENTS.md §3):
// join_game, choose_team, start_game, tick_game, submit_photo en submit_capture doen allemaal
// `select ... for update` op de games-rij. Het échte capaciteitsrisico zit dus in Postgres, niet
// in de UI — daarom roept deze test de RPC's rechtstreeks aan (zoals de client ook zou doen bij
// `?dev=1` nep-GPS) in plaats van 108 browsertabbladen open te zetten.
//
// Simuleert per spel, 18 spelers (3 Boeven + 5x3 Polizei):
//   - alle 18 joinen en kiezen tegelijk hun team (lobby-stormloop)
//   - elke speler "tikt" de klok elke 3 s (precies wat MainScreen.tsx lokaal doet)
//   - Boeven sturen hun locatie elke 15 s, Polizei elke 30 s (useTeamLocations.ts)
//   - Boeven proberen om de ~20 s een bonusfoto (meestal geblokkeerd door de wachttijd, dat is oké)
//   - in de helft van de spellen vangt de hele Polizei (15 spelers) tegelijk aan het begin van de
//     zoektijd — de ergste gelijktijdige-schrijf-race die het spel kent
//
// Vereist: lokale Supabase (npm run db:start). Draaien: npm run test:capacity
// Knoppen: GAMES, PLAYERS_PER_GAME, P95_MS, MAX_MS (env-variabelen, zie onderaan de standaardwaarden).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import setupEnv, { ENV_FILE } from '../setup/supabaseEnv.ts'

setupEnv()
const st = JSON.parse(readFileSync(ENV_FILE, 'utf8'))
if (!st.API_URL) throw new Error('Lokale Supabase draait niet: npm run db:start')

const URL = st.API_URL
const ANON_KEY = st.ANON_KEY ?? st.PUBLISHABLE_KEY
const SERVICE_KEY = st.SERVICE_ROLE_KEY ?? st.SECRET_KEY
const ADMIN_CODE = 'test-admin' // zie supabase/seed.sql

const GAMES = Number(process.env.GAMES ?? 6)
const PLAYERS_PER_GAME = Number(process.env.PLAYERS_PER_GAME ?? 18)
const POLICE_TEAMS = 5 // + 1 Boeven-team = 6 teams x max_players_per_team 3 = 18
const TIME_SCALE = Number(process.env.TIME_SCALE ?? 45)
const HEADSTART_MIN = 15 // -> ±20 s echte tijd bij scale 45
const SEARCH_MIN = 30 // -> ±40 s echte tijd bij scale 45
const P95_MS = Number(process.env.P95_MS ?? 1500) // "geen vertraging"
const MAX_MS = Number(process.env.MAX_MS ?? 5000)
if (PLAYERS_PER_GAME !== 3 + POLICE_TEAMS * 3) {
  throw new Error(`PLAYERS_PER_GAME moet ${3 + POLICE_TEAMS * 3} zijn (3 Boeven + ${POLICE_TEAMS}x3 Polizei); pas de teamverdeling hieronder aan om dit te wijzigen.`)
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a)

/** Nep-GPS: een vast punt in Düsseldorf met wat ruis, zoals een wandelende speler. */
const jitter = ([lat, lng], degrees = 0.0006) => [lat + (Math.random() - 0.5) * degrees, lng + (Math.random() - 0.5) * degrees]
const CENTER = [51.2277, 6.7716] // Burgplatz, ruim binnen het speelgebied
const BEER_SPOT = [51.2263, 6.774] // Zum Uerige

const calls = []
async function measured(client, fn, args, game) {
  const t0 = performance.now()
  const { data, error } = await client.rpc(fn, args)
  calls.push({ fn, game, ms: performance.now() - t0, ok: !error, error: error?.message })
  return { data, error }
}
async function must(client, fn, args, game) {
  const { data, error } = await measured(client, fn, args, game)
  if (error) throw new Error(`${fn} (spel ${game}) faalde: ${error.message}`)
  return data
}

function phone() {
  return createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}
async function newPlayer() {
  const client = phone()
  const { error } = await client.auth.signInAnonymously()
  if (error) throw error
  return client
}
async function uploadPhoto(client, gameId) {
  const path = `${gameId}/${crypto.randomUUID()}.jpg`
  const { error } = await client.storage
    .from('photos')
    .upload(path, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }))
  if (error) throw error
  return path
}

/** Eén volledig spel: lobby-stormloop, dan ~1 minuut gelijktijdig gameplayverkeer. */
async function runGame(idx) {
  const settings = { time_scale: TIME_SCALE, headstart_min: HEADSTART_MIN, search_min: SEARCH_MIN, police_teams: POLICE_TEAMS, max_players_per_team: 3 }
  const creator = await newPlayer()
  const { game_id, join_code } = await must(creator, 'create_game', { p_admin_code: ADMIN_CODE, p_settings: settings }, idx)

  const { data: teams, error: teamsError } = await admin.from('teams').select('id, role, sort').eq('game_id', game_id).order('sort')
  if (teamsError) throw teamsError
  const thieves = teams.find((t) => t.role === 'thieves')
  const police = teams.filter((t) => t.role === 'police')

  // 18 telefoons joinen tegelijk (de eerste hergebruikt de sessie van de aanmaker).
  const phones = [creator, ...(await Promise.all(Array.from({ length: PLAYERS_PER_GAME - 1 }, newPlayer)))]
  const players = await Promise.all(
    phones.map(async (p, i) => {
      const r = await must(p, 'join_game', { p_join_code: join_code, p_name: `G${idx}-${i}`, p_consent: true, p_consent_version: 'v1' }, idx)
      const team = i < 3 ? thieves : police[Math.floor((i - 3) / 3) % police.length]
      return { phone: p, player_id: r.player_id, team }
    }),
  )
  // En kiezen tegelijk hun team (realistisch: iedereen tikt vlak na elkaar in de lobby).
  await Promise.all(players.map((pl) => must(pl.phone, 'choose_team', { p_game_id: game_id, p_team_id: pl.team.id }, idx)))
  await must(players[0].phone, 'start_game', { p_game_id: game_id }, idx)
  log(`spel ${idx} gestart (${join_code}), ${players.length} spelers`)

  const headstartRealMs = (HEADSTART_MIN * 60_000) / TIME_SCALE
  const searchRealMs = (SEARCH_MIN * 60_000) / TIME_SCALE
  const startedAt = Date.now()
  let running = true
  const stopAt = startedAt + headstartRealMs + searchRealMs + 5000

  const loops = players.map(async (pl, i) => {
    const isThief = pl.team.id === thieves.id
    let lastTick = 0
    let lastLoc = 0
    let lastPhoto = 0
    const locEvery = isThief ? 15_000 : 30_000
    const photoEvery = 20_000 + i * 150 // iets uit de pas, zoals echte spelers

    while (running && Date.now() < stopAt) {
      const now = Date.now()
      if (now - lastTick > 3000) {
        lastTick = now
        await measured(pl.phone, 'tick_game', { p_game_id: game_id }, idx)
      }
      if (now - lastLoc > locEvery) {
        lastLoc = now
        const [lat, lng] = jitter(CENTER)
        await measured(pl.phone, 'update_location', { p_game_id: game_id, p_lat: lat, p_lng: lng, p_accuracy_m: 12 }, idx)
      }
      if (isThief && now - lastPhoto > photoEvery) {
        lastPhoto = now
        const useSight = Math.random() < 0.5
        const [lat, lng] = jitter(useSight ? CENTER : BEER_SPOT, 0.0002)
        const path = await uploadPhoto(pl.phone, game_id)
        await measured(
          pl.phone,
          'submit_photo',
          {
            p_game_id: game_id,
            p_client_id: crypto.randomUUID(),
            p_type: useSight ? 'sight' : 'beer',
            p_storage_path: path,
            p_lat: lat,
            p_lng: lng,
            p_accuracy_m: 10,
            p_bar_name: useSight ? null : `Testkroeg ${idx}-${i}-${now}`,
          },
          idx,
        )
      }
      await sleep(250)
    }
  })

  // In de helft van de spellen: alle 15 Polizei-spelers proberen vlak na het vrijkomen tegelijk
  // te vangen. Dit is de zwaarste gelijktijdige-schrijfrace op dezelfde spel-rij (submit_capture
  // doet `for update` net als submit_photo/tick_game): precies wat 18 spelers tegelijk oplevert.
  const captureRace = async () => {
    if (idx % 2 !== 0) return
    // Ruime marge na police_start_at: submit_capture gooit (geen nette rejectie) als het spel nog
    // niet in 'running' staat, dus te vroeg zou een valse fout opleveren, niet een trage/foute uitslag.
    await sleep(headstartRealMs + 5000)
    const copsAttempt = players
      .filter((pl) => pl.team.id !== thieves.id)
      .map(async (pl) => {
        const path = await uploadPhoto(pl.phone, game_id)
        const [lat, lng] = jitter(CENTER)
        return measured(pl.phone, 'submit_capture', { p_game_id: game_id, p_client_id: crypto.randomUUID(), p_storage_path: path, p_lat: lat, p_lng: lng, p_accuracy_m: 10 }, idx)
      })
    const results = await Promise.all(copsAttempt)
    const accepted = results.filter((r) => r.data?.status === 'accepted').length
    log(`spel ${idx}: vangstrace met ${results.length} Polizei tegelijk, ${accepted} geaccepteerd`)
  }

  await Promise.all([...loops, captureRace()])
  running = false

  const { data: game } = await admin.from('games').select('status,winner,ended_at').eq('id', game_id).single()
  log(`spel ${idx} klaar: status=${game?.status} winner=${game?.winner ?? '-'}`)
  return game_id
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]
}

const T0 = Date.now()
log(`start: ${GAMES} spellen x ${PLAYERS_PER_GAME} spelers = ${GAMES * PLAYERS_PER_GAME} gelijktijdige spelers, time_scale ${TIME_SCALE}`)
await Promise.all(Array.from({ length: GAMES }, (_, i) => runGame(i)))
log('alle spellen klaar, resultaten:')

const byFn = new Map()
for (const c of calls) {
  if (!byFn.has(c.fn)) byFn.set(c.fn, [])
  byFn.get(c.fn).push(c)
}

let totalErrors = 0
let anyBreach = false
console.log('\nRPC             n      fouten   p50ms   p95ms   maxms')
for (const [fn, rows] of [...byFn.entries()].sort()) {
  const errors = rows.filter((r) => !r.ok)
  totalErrors += errors.length
  const times = rows.map((r) => r.ms).sort((a, b) => a - b)
  const p50 = percentile(times, 50)
  const p95 = percentile(times, 95)
  const max = times[times.length - 1] ?? 0
  const breach = p95 > P95_MS || max > MAX_MS
  anyBreach ||= breach
  console.log(`${fn.padEnd(15)} ${String(rows.length).padStart(5)}   ${String(errors.length).padStart(6)}   ${p50.toFixed(0).padStart(5)}   ${p95.toFixed(0).padStart(5)}   ${max.toFixed(0).padStart(5)}${breach ? '  <-- TE TRAAG' : ''}`)
  for (const e of errors.slice(0, 5)) console.log(`   FOUT (spel ${e.game}): ${e.error}`)
}
console.log(`\nTotaal: ${calls.length} RPC-aanroepen, ${totalErrors} fouten, duur ${((Date.now() - T0) / 1000).toFixed(1)}s`)

if (totalErrors === 0 && !anyBreach) {
  console.log(`\n✓ Geslaagd: geen fouten en geen vertraging (p95 < ${P95_MS} ms, max < ${MAX_MS} ms) bij ${GAMES * PLAYERS_PER_GAME} gelijktijdige spelers.`)
} else {
  console.log('\n✗ Niet geslaagd: zie fouten/vertraging hierboven.')
  process.exitCode = 1
}
