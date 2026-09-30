import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from './supabase'
import { fetchStaffBookings } from './staffBookings'

describe('fetchStaffBookings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('maps rows and joined city/product names', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'booking-1',
          participant_count: 6,
          contact_name: 'Jan Jansen',
          contact_email: 'jan@example.com',
          status: 'pending',
          price_cents_total: 6750,
          created_at: '2026-09-30T10:00:00Z',
          cities: { name: 'Düsseldorf' },
          products: { name_nl: 'Go' },
        },
      ],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ order })
    vi.spyOn(supabase, 'from').mockReturnValue({ select } as never)

    const result = await fetchStaffBookings()

    expect(select).toHaveBeenCalledWith(expect.stringContaining('cities(name)'))
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toEqual([
      {
        id: 'booking-1',
        cityName: 'Düsseldorf',
        productName: 'Go',
        participantCount: 6,
        contactName: 'Jan Jansen',
        contactEmail: 'jan@example.com',
        status: 'pending',
        priceCentsTotal: 6750,
        createdAt: '2026-09-30T10:00:00Z',
      },
    ])
  })

  it('throws when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error('RLS denied') })
    const select = vi.fn().mockReturnValue({ order })
    vi.spyOn(supabase, 'from').mockReturnValue({ select } as never)

    await expect(fetchStaffBookings()).rejects.toThrow('RLS denied')
  })
})
