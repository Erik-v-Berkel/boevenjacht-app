import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmergencyButton } from './EmergencyButton'
import { supabase } from '../lib/supabase'

describe('EmergencyButton', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail(new Error('geen toestemming')) },
    })
  })

  it('toont "Bel 112" als tel-link vóórdat je iets meldt', () => {
    render(<EmergencyButton gameId="game-1" />)
    fireEvent.click(screen.getByRole('button', { name: /noodknop/i }))

    const call = screen.getByRole('link', { name: /bel 112/i })
    expect(call).toHaveAttribute('href', 'tel:112')
  })

  it('meldt het incident bij Boevenjacht, ook zonder locatie', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: { id: 'i1' }, error: null } as never)
    render(<EmergencyButton gameId="game-1" />)
    fireEvent.click(screen.getByRole('button', { name: /noodknop/i }))

    fireEvent.click(screen.getByRole('button', { name: /meld dit bij boevenjacht/i }))

    expect(await screen.findByText(/melding verstuurd/i)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('report_incident', {
      p_game_id: 'game-1',
      p_lat: null,
      p_lng: null,
      p_called_112: false,
    })
  })

  it('geeft door dat 112 al gebeld is als je daarop hebt getikt', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: { id: 'i1' }, error: null } as never)
    render(<EmergencyButton gameId="game-1" />)
    fireEvent.click(screen.getByRole('button', { name: /noodknop/i }))

    fireEvent.click(screen.getByRole('link', { name: /bel 112/i }))
    fireEvent.click(screen.getByRole('button', { name: /meld dit bij boevenjacht/i }))

    await screen.findByText(/melding verstuurd/i)
    expect(rpc).toHaveBeenCalledWith('report_incident', expect.objectContaining({ p_called_112: true }))
  })

  it('toont een foutmelding in plaats van te crashen als de server een fout geeft', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: { message: 'Je doet niet mee aan dit spel' } } as never)
    render(<EmergencyButton gameId="game-1" />)
    fireEvent.click(screen.getByRole('button', { name: /noodknop/i }))

    fireEvent.click(screen.getByRole('button', { name: /meld dit bij boevenjacht/i }))

    expect(await screen.findByText('Je doet niet mee aan dit spel')).toBeInTheDocument()
  })
})
