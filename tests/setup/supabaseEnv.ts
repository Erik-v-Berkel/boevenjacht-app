import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Haalt de gegevens van de lokale Supabase één keer op (niet per testbestand: parallelle
// `supabase status`-aanroepen zijn traag en falen soms).
export const ENV_FILE = 'node_modules/.cache/boevenjacht-test-env.json'

export default function setup() {
  let status: Record<string, string>
  try {
    status = JSON.parse(
      execSync('npx --yes supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 }),
    )
  } catch {
    // Geen lokale Supabase: alleen de unit-tests kunnen draaien.
    status = {}
  }
  mkdirSync(dirname(ENV_FILE), { recursive: true })
  writeFileSync(ENV_FILE, JSON.stringify(status))
}
