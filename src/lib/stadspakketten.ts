import { supabase } from './supabase'
import type { BookingDraft, BookingResult, City, Product } from './stadspakketTypes'

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
