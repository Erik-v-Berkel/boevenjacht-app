import { supabase } from './supabase'
import type { BookingDraft, BookingResult, BookingStatus, City, Product } from './stadspakketTypes'

export async function fetchActiveCities(): Promise<City[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('id, slug, name, theme, default_locale')
    .eq('status', 'active')
    .order('name')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    theme: row.theme,
    defaultLocale: row.default_locale,
  }))
}

export async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, slug, name_nl, name_en, price_cents, requires_host, min_players, max_players')
    .eq('active', true)
    .order('sort_order')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    nameNl: row.name_nl,
    nameEn: row.name_en,
    priceCents: row.price_cents,
    requiresHost: row.requires_host,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
  }))
}

export async function fetchLaunchOfferSlotsRemaining(): Promise<number> {
  const { data, error } = await supabase.rpc('launch_offer_slots_remaining')
  if (error) throw error
  return data as number
}

export async function submitBooking(draft: BookingDraft): Promise<BookingResult> {
  const { data, error } = await supabase.rpc('submit_booking', {
    p_city_slug: draft.citySlug,
    p_product_slug: draft.productSlug,
    p_participant_count: draft.participantCount,
    p_contact_name: draft.contactName,
    p_contact_email: draft.contactEmail,
    p_locale: draft.locale,
  })
  if (error) throw error
  return {
    id: data.id,
    priceCentsTotal: data.price_cents_total,
    launchOfferApplied: data.launch_offer_applied,
    status: data.status,
  }
}

/** Zet de Mollie-checkout uit voor een bestaande boeking en geeft de checkout-URL terug. */
export async function startMolliePayment(bookingId: string): Promise<{ checkoutUrl: string }> {
  const { data, error } = await supabase.functions.invoke('mollie-create-payment', {
    body: { booking_id: bookingId, app_base_url: location.origin },
  })
  if (error) throw error
  return { checkoutUrl: data.checkout_url }
}

/** Voor de "bedankt"-pagina na terugkomst van Mollie: alleen status + spelcode, geen PII. */
export async function fetchBookingStatus(bookingId: string): Promise<BookingStatus> {
  const { data, error } = await supabase.rpc('get_booking_status', { p_booking_id: bookingId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('boeking niet gevonden')
  return { status: row.status, joinCode: row.join_code }
}
