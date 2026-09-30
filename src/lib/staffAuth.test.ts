import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStaffSession, onStaffAuthStateChange, signInStaff, signOutStaff } from './staffAuth'
import { supabase } from './supabase'

describe('staffAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('signInStaff returns the session on success', async () => {
    const session = { access_token: 'jwt-123' } as never
    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: {} as never, session },
      error: null,
    } as never)

    await expect(signInStaff('erik@boevenjacht.nl', 'geheim')).resolves.toBe(session)
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'erik@boevenjacht.nl',
      password: 'geheim',
    })
  })

  it('signInStaff throws the Supabase error instead of swallowing it', async () => {
    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('Invalid login credentials'),
    } as never)

    await expect(signInStaff('erik@boevenjacht.nl', 'fout')).rejects.toThrow('Invalid login credentials')
  })

  it('signInStaff throws when Supabase reports success without a session', async () => {
    vi.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: {} as never, session: null },
      error: null,
    } as never)

    await expect(signInStaff('erik@boevenjacht.nl', 'geheim')).rejects.toThrow(/geen sessie/)
  })

  it('signOutStaff propagates errors from Supabase', async () => {
    vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: new Error('network down') } as never)

    await expect(signOutStaff()).rejects.toThrow('network down')
  })

  it('getStaffSession returns null when there is no active session', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null,
    } as never)

    await expect(getStaffSession()).resolves.toBeNull()
  })

  it('onStaffAuthStateChange forwards events and returns an unsubscribe function', () => {
    const unsubscribe = vi.fn()
    const spy = vi
      .spyOn(supabase.auth, 'onAuthStateChange')
      .mockReturnValue({ data: { subscription: { unsubscribe } } } as never)

    const callback = vi.fn()
    const stop = onStaffAuthStateChange(callback)
    expect(spy).toHaveBeenCalledWith(callback)

    stop()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
