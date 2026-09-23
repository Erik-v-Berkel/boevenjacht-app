// Volledige speltest in de browser met 5 "telefoons" (nep-camera, nep-GPS):
// lobby → start → bierfoto zonder bereik (wachtrij) → melding bij de politie → "Blijf bij elkaar!"
// → twee politieteams vangen tegelijk → eindschermen → zip.
//
// Vereist: lokale Supabase (npm run db:start), dev-server (npm run dev) en Microsoft Edge of Chrome.
// Draaien: npm run test:e2e   (screenshots in test-results/)
// Andere browser: BROWSER_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" npm run test:e2e
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync } from 'node:fs'
import setupEnv, { ENV_FILE } from '../setup/supabaseEnv.ts'

const OUT = 'test-results'
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
mkdirSync(OUT, { recursive: true })
setupEnv()
const st = JSON.parse(readFileSync(ENV_FILE, 'utf8'))
if (!st.API_URL) throw new Error('Lokale Supabase draait niet: npm run db:start')
const admin = createClient(st.API_URL, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const UERIGE = { latitude: 51.2263, longitude: 6.774, accuracy: 12 }
const FAR = { latitude: 51.2285, longitude: 6.774, accuracy: 12 } // ±245 m noordelijker
const log = (...a) => console.log('•', ...a)

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const contexts = []
const phone = async (geo) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'nl-NL', acceptDownloads: true,
    permissions: ['geolocation', 'camera'], geolocation: geo ?? UERIGE,
  })
  contexts.push(ctx)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message, e.stack?.split('\n').slice(1, 4).join(' | ')))
  page.on('console', (m) => m.type() === 'error' && !/Failed to fetch|ERR_INTERNET_DISCONNECTED|WebSocket/.test(m.text()) && console.log('CONSOLE', m.text()))
  return page
}
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
const hold = async (p, sel, ms) => {
  const box = await p.locator(sel).boundingBox()
  await p.mouse.move(box.x + 20, box.y + 10)
  await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up()
}
const photo = async (p) => {
  await p.waitForSelector('button[aria-label="Foto maken"]', { timeout: 10000 })
  await p.waitForTimeout(800)
  await p.click('button[aria-label="Foto maken"]')
}

// --- Lobby ---
const erik = await phone()
await erik.goto(`${BASE}/nieuw`)
await erik.fill('input[type=password]', 'test-admin')
await erik.check('input[type=checkbox]')
await erik.click('text=Nieuw spel >> nth=-1')
await erik.waitForSelector('text=Spel aangemaakt')
const code = (await erik.locator('p.font-mono').first().textContent()).trim()
await erik.click('text=Zelf meedoen')
const boef2 = await phone(FAR)
const [anna, bram, cees] = [await phone(), await phone(), await phone()]
const all = [erik, boef2, anna, bram, cees]
const who = [['Erik', 'Boeven'], ['Dirk', 'Boeven'], ['Anna', 'Polizei A'], ['Bram', 'Polizei B'], ['Cees', 'Polizei C']]
for (const [i, p] of all.entries()) {
  if (i > 0) await p.goto(`${BASE}/j/${code}`)
  await p.fill('#name', who[i][0])
  await p.click('text=Naar de lobby')
  await p.waitForSelector('text=Lobby')
  await p.locator('section', { hasText: who[i][1] }).getByRole('button').first().click()
  await p.waitForTimeout(400)
}
const { data: g } = await admin.from('games').select('id').eq('join_code', code).single()
await erik.waitForTimeout(800)
await hold(anna, 'button:has-text("Start spel")', 3300)
await erik.waitForSelector('text=Voorsprong')
log('gestart', code)

// --- Offline bierfoto via de wachtrij ---
await erik.click('nav >> text=Camera')
await erik.waitForSelector('text=Bier in een kroeg')
await erik.waitForTimeout(500)
await erik.click('text=Bier in een kroeg')
await photo(erik)
await erik.fill('input[placeholder="Naam van de kroeg"]', 'Zum Uerige')
await contexts[0].setOffline(true)
await erik.click('text=Versturen')
await erik.waitForSelector('text=Wordt verstuurd…')
await erik.waitForSelector('text=Geen of slecht bereik', { timeout: 20000 })
await shot(erik, 'f1-offline')
log('offline: foto wacht in de rij')
await contexts[0].setOffline(false)
await erik.click('text=Nu opnieuw proberen')
await erik.waitForSelector('text=Verstuurd ✓ −10 min', { timeout: 30000 })
log('online: verstuurd −10 min')

// Toast bij de politie
await anna.waitForSelector('text=Boeven (Erik): −10 min bij Zum Uerige', { timeout: 15000 })
await shot(anna, 'f2-toast-politie')
log('politie kreeg melding')

// --- Boeven zien elkaar ---
await erik.click('text=Terug')
await erik.click('nav >> text=Kaart')
await erik.waitForSelector('text=Blijf bij elkaar! Dirk is', { timeout: 40000 })
await erik.waitForTimeout(1500)
await shot(erik, 'f3-blijf-bij-elkaar')
log('blijf bij elkaar zichtbaar')
const { data: policeSees } = await createClient(st.API_URL, st.ANON_KEY).from('player_locations').select('*').eq('game_id', g.id)
log('anon ziet locaties:', policeSees?.length ?? 0)

// --- Vangen: Anna en Bram tegelijk ---
await admin.from('games').update({ police_start_at: new Date(Date.now() - 1000).toISOString() }).eq('id', g.id)
for (const p of [anna, bram]) {
  await p.click('nav >> text=Camera')
  await p.click('text=Vangstfoto maken', { timeout: 15000 })
  await photo(p)
  await p.click('text=Halt, Polizei! Gevangen!')
  await p.waitForSelector('text=Tik nogmaals om te bevestigen')
}
await shot(anna, 'f4-bevestigen')
await anna.click('text=Tik nogmaals om te bevestigen')
await bram.click('text=Tik nogmaals om te bevestigen')

await erik.waitForSelector('text=Jullie zijn gevangen door Polizei A om', { timeout: 20000 })
await anna.waitForSelector('text=Jullie hebben gewonnen!', { timeout: 20000 })
await bram.waitForSelector('text=Te laat, Polizei A was je voor.', { timeout: 30000 })
await cees.waitForSelector('text=Gevangen door Polizei A!', { timeout: 20000 })
await erik.waitForTimeout(2500)
await shot(erik, 'f5-einde-boef')
await shot(bram, 'f6-einde-te-laat')
await shot(anna, 'f7-einde-winnaar-vol', true)
log('eindschermen goed')

// --- Zip ---
const [dl] = await Promise.all([anna.waitForEvent('download', { timeout: 30000 }), anna.click("text=Download alle foto's (zip)")])
const path = `${OUT}/fotos.zip`
await dl.saveAs(path)
log('zip:', dl.suggestedFilename(), readFileSync(path).length, 'bytes')

const { data: game } = await admin.from('games').select('status,winner,bonus_total_min').eq('id', g.id).single()
const { data: ph } = await admin.from('photos').select('type,status').eq('game_id', g.id).order('created_at')
const { data: ev } = await admin.from('events').select('type').eq('game_id', g.id).order('id')
log('game:', JSON.stringify(game))
log('photos:', ph.map((p) => `${p.type}:${p.status}`).join(', '))
log('events:', ev.map((e) => e.type).join(', '))
await browser.close()
console.log('✓ Alles werkt')
