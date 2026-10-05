// COP-74: dagelijkse 30-dagen-wipe van oude spellen (en daarmee hun foto's uit Storage).
// Aangeroepen door pg_cron → pg_net (private.run_photo_retention, zie
// 20261003000003_photo_retention.sql), met de header x-cleanup-secret.
//
// Doet hetzelfde als de handmatige opruimstappen in README.md ("Na het weekend: opruimen"):
// per spel ouder dan 30 dagen eerst de Storage-objecten weg (rechtstreeks uit storage.objects
// verwijderen via SQL blokkeert Supabase, vandaar de Storage-API hier), dan de games-rij
// (cascade ruimt teams/spelers/foto's/events/feedback vanzelf op).
//
// Secrets (npx supabase secrets set …): CLEANUP_SECRET. SUPABASE_URL en
// SUPABASE_SERVICE_ROLE_KEY zijn er automatisch.
import { createClient } from 'npm:@supabase/supabase-js@2'

const RETENTION_DAYS = 30
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.headers.get('x-cleanup-secret') !== Deno.env.get('CLEANUP_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: games, error } = await db.from('games').select('id, join_code').lt('created_at', cutoff)
  if (error) return new Response(error.message, { status: 500 })

  let deletedObjects = 0
  for (const game of games ?? []) {
    const { data: objects } = await db.storage.from('photos').list(game.id)
    const paths = (objects ?? []).map((o) => `${game.id}/${o.name}`)
    if (paths.length > 0) {
      await db.storage.from('photos').remove(paths)
      deletedObjects += paths.length
    }
    await db.from('games').delete().eq('id', game.id)
  }

  return new Response(
    JSON.stringify({ retentionDays: RETENTION_DAYS, deletedGames: games?.length ?? 0, deletedObjects }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
