import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffBookingsList } from './StaffBookingsList'
import * as staffBookings from '../lib/staffBookings'

describe('StaffBookingsList', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading state and then the bookings once data resolves', async () => {
    vi.spyOn(staffBookings, 'fetchStaffBookings').mockResolvedValue([
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

    render(<StaffBookingsList />)

    expect(screen.getByText(/laden/i)).toBeInTheDocument()
    expect(await screen.findByText('Jan Jansen')).toBeInTheDocument()
    expect(screen.getByText(/Düsseldorf/)).toBeInTheDocument()
    expect(screen.getByText(/Nog te bevestigen/)).toBeInTheDocument()
  })

  it('shows an empty state when there are no bookings', async () => {
    vi.spyOn(staffBookings, 'fetchStaffBookings').mockResolvedValue([])

    render(<StaffBookingsList />)

    expect(await screen.findByText('Nog geen boekingen.')).toBeInTheDocument()
  })

  it('shows a graceful error instead of crashing when the backend is unreachable', async () => {
    vi.spyOn(staffBookings, 'fetchStaffBookings').mockRejectedValue(new Error('Failed to fetch'))

    render(<StaffBookingsList />)

    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument()
  })
})
