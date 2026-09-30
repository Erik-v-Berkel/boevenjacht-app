import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Join from './Join'
import { supabase } from '../lib/supabase'
import { CONSENT_VERSION } from '../lib/safety'

describe('Join: akkoord op de veiligheidsverklaring', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.restoreAllMocks()
    // InstallHint (niet onderdeel van deze test) vraagt de display-mode op.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    })
  })

  it('houdt de knop uit tot naam én akkoord zijn ingevuld, en stuurt dan het akkoord mee', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: { game_id: 'g1' }, error: null } as never)

    render(<Join code="BIER42" />)

    const submit = screen.getByRole('button', { name: /naar de lobby/i })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/je naam/i), { target: { value: 'Erik' } })
    expect(submit).toBeDisabled() // nog geen akkoord

    fireEvent.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()

    fireEvent.click(submit)

    expect(rpc).toHaveBeenCalledWith('join_game', {
      p_join_code: 'BIER42',
      p_name: 'Erik',
      p_consent: true,
      p_consent_version: CONSENT_VERSION,
    })
  })

  it('zet de knop weer uit als het akkoord wordt ingetrokken', () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: {}, error: null } as never)
    render(<Join code="BIER42" />)

    fireEvent.change(screen.getByLabelText(/je naam/i), { target: { value: 'Erik' } })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.click(checkbox)

    expect(screen.getByRole('button', { name: /naar de lobby/i })).toBeDisabled()
  })
})
