// Stuurt een pushmelding naar alle telefoons van een spel als er een event bijkomt.
// Aangeroepen door de databasetrigger events_push (pg_net), met de header x-push-secret.
//
// Secrets (npx supabase secrets set …): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SECRET.
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn er automatisch.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { eventText } from '../_shared/eventText.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:boevenjacht@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }
  const { event_id } = await req.json()

  const { data: e } = await db.from('events').select('*').eq('id', event_id).single()
  if (!e) return new Response('event not found', { status: 404 })

  const [{ data: players }, { data: teams }, { data: subs }] = await Promise.all([
    db.from('players').select('id, name, team_id').eq('game_id', e.game_id),
    db.from('teams').select('id, name, role').eq('game_id', e.game_id),
    db.from('push_subscriptions').select('*').eq('game_id', e.game_id),
  ])

  const { icon, text } = eventText(e, players ?? [], teams ?? [])
  const body = JSON.stringify({ title: `${icon} Boevenjacht`, body: text, tag: `event-${e.id}`, url: `/spel/${e.game_id}` })

  // Niet naar wie het zelf deed (bv. de boef die de foto maakte)
  const targets = (subs ?? []).filter((s) => s.player_id !== e.payload.player_id)

  let sent = 0
  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 600,
          urgency: 'high',
        })
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // Abonnement verlopen of ingetrokken: opruimen
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        else console.error('push mislukt', status, err)
      }
    }),
  )

  return new Response(JSON.stringify({ sent, of: targets.length }), { headers: { 'Content-Type': 'application/json' } })
})
