// Bouwt de payment-aanvraag voor Mollie's Payments API. Puur en zonder imports, net als
// eventText.ts: gedeeld door de Edge Function mollie-create-payment en getest via
// src/lib/molliePayment.ts (src/lib/molliePayment.test.ts).

export interface BookingForPayment {
  id: string
  priceCentsTotal: number
  cityName: string
  productNameNl: string
  locale: string
}

export interface MolliePaymentUrls {
  /** Waar de klant na de Mollie-checkout naartoe gaat — de eigen app, nooit een Mollie-domein. */
  appBaseUrl: string
  /** Waar Mollie de server-naar-server melding naartoe stuurt (de Edge Function mollie-webhook). */
  webhookUrl: string
}

export interface MolliePaymentRequest {
  amount: { currency: 'EUR'; value: string }
  description: string
  redirectUrl: string
  webhookUrl: string
  locale: string
  metadata: { booking_id: string }
}

/** Mollie wil het bedrag als string met exact 2 decimalen, bv. "12.50" — nooit een getal. */
export function formatMollieAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function buildMolliePaymentRequest(booking: BookingForPayment, urls: MolliePaymentUrls): MolliePaymentRequest {
  return {
    amount: { currency: 'EUR', value: formatMollieAmount(booking.priceCentsTotal) },
    description: `Boevenjacht ${booking.cityName} — ${booking.productNameNl}`,
    redirectUrl: `${urls.appBaseUrl}/boeken/bedankt/${booking.id}`,
    webhookUrl: urls.webhookUrl,
    locale: booking.locale === 'en' ? 'en_GB' : 'nl_NL',
    metadata: { booking_id: booking.id },
  }
}
