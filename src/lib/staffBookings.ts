import { supabase } from './supabase'

export interface StaffBooking {
  id: string
  cityName: string
  productName: string
  participantCount: number
  contactName: string
  contactEmail: string
  status: string
  priceCentsTotal: number
  createdAt: string
}

interface StaffBookingRow {
  id: string
  participant_count: number
  contact_name: string
  contact_email: string
  status: string
  price_cents_total: number
  created_at: string
  cities: { name: string } | null
  products: { name_nl: string } | null
}

// Leest boekingen rechtstreeks via de RLS-policy "staff leest boekingen" (COP-6-fundament,
// zie 20260930000004_staff_bookings_read.sql) — geen RPC nodig voor lezen.
export async function fetchStaffBookings(): Promise<StaffBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, participant_count, contact_name, contact_email, status, price_cents_total, created_at, cities(name), products(name_nl)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as StaffBookingRow[]).map((row) => ({
    id: row.id,
    cityName: row.cities?.name ?? '-',
    productName: row.products?.name_nl ?? '-',
    participantCount: row.participant_count,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    status: row.status,
    priceCentsTotal: row.price_cents_total,
    createdAt: row.created_at,
  }))
}
