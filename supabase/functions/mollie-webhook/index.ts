// Mollie's server-naar-server melding na een betaalpoging. Mollie stuurt alleen een payment-id,
// form-encoded, zonder Supabase-sessie — vandaar verify_jwt = false (supabase/config.toml).
// Veiligheid zit niet in een geheime header (Mollie ondersteunt dat niet), maar in: we vertrouwen
// nooit de melding zelf, en halen de status altijd rechtstreeks bij Mollie op met onze eigen
// API-key voordat we een boeking bevestigen (Mollie-documentatie "Verifying webhook calls").
//
// Secrets (npx supabase secrets set …): MOLLIE_API_KEY, RESEND_API_KEY, BOOKING_MAIL_FROM,
// APP_BASE_URL (de domeinnaam van de live app, voor de join-link in de mail — anders dan bij
// mollie-create-payment kent deze functie geen browser-origin, dus moet dit vastliggen).
// Zonder RESEND_API_KEY/APP_BASE_URL wordt de boeking wel bevestigd (het spel wordt aangemaakt),
// maar blijft de join-link-mail achterwege — dat staat dan in de logs.
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const MOLLIE_API_KEY = Deno.env.get('MOLLIE_API_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const MAIL_FROM = Deno.env.get('BOOKING_MAIL_FROM') ?? 'Boevenjacht <onboarding@resend.dev>'

interface ConfirmedBooking {
  status: string
  contact_name: string
  contact_email: string
  join_code: string | null
  locale: string
}

Deno.serve(async (req) => {
  const form = await req.formData().catch(() => null)
  const paymentId = form?.get('id')?.toString()
  // Altijd 200 teruggeven bij iets wat niet aan ons ligt, anders blijft Mollie dit eindeloos
  // herhalen op een melding die we nooit kunnen verwerken.
  if (!paymentId) return new Response('ok')

  const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MOLLIE_API_KEY}` },
  })
  if (!mollieRes.ok) {
    console.error('kon Mollie-betaling niet ophalen', paymentId, mollieRes.status)
    return new Response('ok')
  }
  const payment = await mollieRes.json()
  const bookingId = payment.metadata?.booking_id
  if (!bookingId) return new Response('ok')

  const { data: booking, error } = await db.rpc('fulfil_booking_payment', {
    p_booking_id: bookingId,
    p_mollie_payment_id: payment.id,
    p_mollie_status: payment.status,
  })
  if (error) {
    console.error('fulfil_booking_payment mislukt', bookingId, error.message)
    return new Response('ok')
  }

  const confirmed = booking as ConfirmedBooking
  if (confirmed.status === 'confirmed' && confirmed.join_code) {
    await sendJoinLinkEmail(confirmed)
  }

  return new Response('ok')
})

async function sendJoinLinkEmail(booking: ConfirmedBooking) {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY ontbreekt, geen join-link-mail verstuurd voor boeking met spelcode', booking.join_code)
    return
  }
  const appBaseUrl = Deno.env.get('APP_BASE_URL')
  if (!appBaseUrl) {
    console.error('APP_BASE_URL ontbreekt, kan geen join-link bouwen voor spelcode', booking.join_code)
    return
  }
  const link = `${appBaseUrl}/j/${booking.join_code}`
  const isEn = booking.locale === 'en'
  const subject = isEn ? 'Your Boevenjacht game is ready!' : 'Je Boevenjacht-spel staat klaar!'
  const html = isEn
    ? `<p>Hi ${escapeHtml(booking.contact_name)},</p><p>Your payment went through. Your game code is <strong>${booking.join_code}</strong>.</p><p>Join here: <a href="${link}">${link}</a></p>`
    : `<p>Hoi ${escapeHtml(booking.contact_name)},</p><p>Je betaling is gelukt. Jullie spelcode is <strong>${booking.join_code}</strong>.</p><p>Meedoen: <a href="${link}">${link}</a></p>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: booking.contact_email, subject, html }),
  })
  if (!res.ok) console.error('join-link-mail versturen mislukt', res.status, await res.text())
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
