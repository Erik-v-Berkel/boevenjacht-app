import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as staffAuth from '../lib/staffAuth'
import { useStaffSession } from './useStaffSession'

describe('useStaffSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('starts loading and resolves to the current session', async () => {
    const session = { access_token: 'jwt-123' } as never
    vi.spyOn(staffAuth, 'getStaffSession').mockResolvedValue(session)
    vi.spyOn(staffAuth, 'onStaffAuthStateChange').mockReturnValue(() => {})

    const { result } = renderHook(() => useStaffSession())

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session).toBe(session)
    expect(result.current.error).toBeNull()
  })

  it('surfaces an error instead of leaving the hook stuck loading', async () => {
    vi.spyOn(staffAuth, 'getStaffSession').mockRejectedValue(new Error('Failed to fetch'))
    vi.spyOn(staffAuth, 'onStaffAuthStateChange').mockReturnValue(() => {})

    const { result } = renderHook(() => useStaffSession())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session).toBeNull()
    expect(result.current.error).toBe('Failed to fetch')
  })

  it('updates the session when an auth state change fires', async () => {
    vi.spyOn(staffAuth, 'getStaffSession').mockResolvedValue(null)
    let emit: (session: never) => void = () => {}
    vi.spyOn(staffAuth, 'onStaffAuthStateChange').mockImplementation((callback) => {
      emit = (session) => callback('SIGNED_IN' as never, session)
      return () => {}
    })

    const { result } = renderHook(() => useStaffSession())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const session = { access_token: 'jwt-456' } as never
    act(() => emit(session))

    expect(result.current.session).toBe(session)
  })

  it('unsubscribes on unmount', async () => {
    vi.spyOn(staffAuth, 'getStaffSession').mockResolvedValue(null)
    const unsubscribe = vi.fn()
    vi.spyOn(staffAuth, 'onStaffAuthStateChange').mockReturnValue(unsubscribe)

    const { unmount } = renderHook(() => useStaffSession())
    await waitFor(() => expect(unsubscribe).not.toHaveBeenCalled())

    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
