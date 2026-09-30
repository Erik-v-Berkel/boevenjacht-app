import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookingWizard } from './BookingWizard'
import * as stadspakketten from '../lib/stadspakketten'

describe('BookingWizard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading state and then the city step once data resolves', async () => {
    vi.spyOn(stadspakketten, 'fetchActiveCities').mockResolvedValue([
      { id: 'city-1', slug: 'utrecht', name: 'Utrecht', theme: 'Politie/Proost', defaultLocale: 'nl' },
    ])
    vi.spyOn(stadspakketten, 'fetchActiveProducts').mockResolvedValue([
      {
        id: 'prod-1',
        slug: 'go',
        nameNl: 'Go',
        nameEn: 'Go',
        priceCents: 1500,
        requiresHost: false,
        minPlayers: 2,
        maxPlayers: 18,
      },
    ])
    vi.spyOn(stadspakketten, 'fetchLaunchOfferSlotsRemaining').mockResolvedValue(10)

    render(<BookingWizard />)

    expect(screen.getByText(/laden/i)).toBeInTheDocument()
    expect(await screen.findByText('Kies je stad')).toBeInTheDocument()
    expect(screen.getByText('Utrecht')).toBeInTheDocument()
  })

  it('shows a graceful error instead of crashing when the backend is unreachable', async () => {
    vi.spyOn(stadspakketten, 'fetchActiveCities').mockRejectedValue(new Error('Failed to fetch'))
    vi.spyOn(stadspakketten, 'fetchActiveProducts').mockResolvedValue([])
    vi.spyOn(stadspakketten, 'fetchLaunchOfferSlotsRemaining').mockResolvedValue(0)

    render(<BookingWizard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch')
  })
})
