import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BookingWizard } from './BookingWizard'
import * as stadspakketten from '../lib/stadspakketten'

const CITY = { id: 'city-1', slug: 'utrecht', name: 'Utrecht', theme: 'Politie/Proost', defaultLocale: 'nl' as const }
const PRODUCT = {
  id: 'prod-1',
  slug: 'go' as const,
  nameNl: 'Go',
  nameEn: 'Go',
  priceCents: 1500,
  requiresHost: false,
  minPlayers: 2,
  maxPlayers: 18,
}

async function fillUntilGegevens() {
  render(<BookingWizard />)
  fireEvent.click(await screen.findByText('Utrecht'))
  fireEvent.click(await screen.findByText('Go'))
  fireEvent.change(screen.getByLabelText(/Naam/i), { target: { value: 'Erik' } })
  fireEvent.change(screen.getByLabelText(/E-mailadres/i), { target: { value: 'erik@example.com' } })
}

describe('BookingWizard', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(stadspakketten, 'fetchActiveCities').mockResolvedValue([CITY])
    vi.spyOn(stadspakketten, 'fetchActiveProducts').mockResolvedValue([PRODUCT])
    vi.spyOn(stadspakketten, 'fetchLaunchOfferSlotsRemaining').mockResolvedValue(10)
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

  it('submits the booking and redirects to the Mollie checkout URL on success', async () => {
    vi.spyOn(stadspakketten, 'submitBooking').mockResolvedValue({
      id: 'booking-1',
      priceCentsTotal: 9000,
      launchOfferApplied: false,
      status: 'pending',
    })
    vi.spyOn(stadspakketten, 'startMolliePayment').mockResolvedValue({ checkoutUrl: 'https://mollie.test/checkout/abc' })
    const location = { href: '' }
    vi.stubGlobal('location', location)

    await fillUntilGegevens()
    fireEvent.click(screen.getByRole('button', { name: /Naar betalen/i }))

    await waitFor(() => expect(location.href).toBe('https://mollie.test/checkout/abc'))
    expect(stadspakketten.startMolliePayment).toHaveBeenCalledWith('booking-1')
  })

  it('offers a retry that re-starts payment without re-submitting the booking', async () => {
    vi.spyOn(stadspakketten, 'submitBooking').mockResolvedValue({
      id: 'booking-2',
      priceCentsTotal: 9000,
      launchOfferApplied: false,
      status: 'pending',
    })
    const startMolliePayment = vi
      .spyOn(stadspakketten, 'startMolliePayment')
      .mockRejectedValueOnce(new Error('Mollie is even onbereikbaar'))
      .mockResolvedValueOnce({ checkoutUrl: 'https://mollie.test/checkout/retry' })
    const location = { href: '' }
    vi.stubGlobal('location', location)

    await fillUntilGegevens()
    fireEvent.click(screen.getByRole('button', { name: /Naar betalen/i }))
    expect(await screen.findByText('Mollie is even onbereikbaar')).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Probeer de betaling opnieuw/i))

    await waitFor(() => expect(location.href).toBe('https://mollie.test/checkout/retry'))
    expect(stadspakketten.submitBooking).toHaveBeenCalledTimes(1) // geen tweede boeking aangemaakt
    expect(startMolliePayment).toHaveBeenCalledTimes(2)
    expect(startMolliePayment).toHaveBeenNthCalledWith(2, 'booking-2')
  })
})
