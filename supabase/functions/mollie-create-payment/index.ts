// Zet een Mollie-checkout uit voor een bestaande 'pending' boeking (submit_booking()) en geeft de
// checkout-URL terug zodat de klant kan worden doorgestuurd. Aangeroepen door de boekingswizard
// (src/lib/stadspakketten.ts) via de normale anon-sessie, dus verify_jwt staat gewoon aan
// (zie supabase/config.toml).
//
// Secrets (npx supabase secrets set …): MOLLIE_API_KEY.
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn er automatisch.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildMolliePaymentRequest } from '../_shared/molliePayment.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const MOLLIE_API_KEY = Deno.env.get('MOLLIE_API_KEY')!
const WEBHOOK_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mollie-webhook`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let bookingId: string | undefined
  let appBaseUrl: string | undefined
  try {
    const body = await req.json()
    bookingId = body.booking_id
    appBaseUrl = body.app_base_url
  } catch {
    return json({ error: 'ongeldige aanvraag' }, 400)
  }
  if (!bookingId || !appBaseUrl) return json({ error: 'booking_id en app_base_url zijn verplicht' }, 400)
  if (!/^https?:\/\//.test(appBaseUrl)) return json({ error: 'ongeldige app_base_url' }, 400)

  const { data: booking, error } = await db
    .from('bookings')
    .select('id, status, price_cents_total, locale, cities(name), products(name_nl)')
    .eq('id', bookingId)
    .single()
  if (error || !booking) return json({ error: 'boeking niet gevonden' }, 404)
  if (booking.status !== 'pending') return json({ error: 'boeking is al afgehandeld' }, 409)

  const payload = buildMolliePaymentRequest(
    {
      id: booking.id,
      priceCentsTotal: booking.price_cents_total,
      cityName: (booking.cities as { name: string } | null)?.name ?? '',
      productNameNl: (booking.products as { name_nl: string } | null)?.name_nl ?? '',
      locale: booking.locale,
    },
    { appBaseUrl, webhookUrl: WEBHOOK_URL },
  )

  const mollieRes = await fetch('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const payment = await mollieRes.json()
  if (!mollieRes.ok) {
    console.error('Mollie create-payment mislukt', mollieRes.status, payment)
    return json({ error: 'betaling aanmaken mislukt' }, 502)
  }

  await db.from('bookings').update({ mollie_payment_id: payment.id }).eq('id', bookingId).eq('status', 'pending')

  return json({ checkout_url: payment._links.checkout.href })
})
