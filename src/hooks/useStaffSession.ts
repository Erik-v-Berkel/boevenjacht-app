import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { getStaffSession, onStaffAuthStateChange } from '../lib/staffAuth'

export interface StaffSessionState {
  session: Session | null
  isLoading: boolean
  error: string | null
}

export function useStaffSession(): StaffSessionState {
  const [state, setState] = useState<StaffSessionState>({ session: null, isLoading: true, error: null })

  useEffect(() => {
    let active = true

    getStaffSession()
      .then((session) => {
        if (active) setState({ session, isLoading: false, error: null })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ session: null, isLoading: false, error: error instanceof Error ? error.message : String(error) })
        }
      })

    const unsubscribe = onStaffAuthStateChange((_event, session) => {
      if (active) setState({ session, isLoading: false, error: null })
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return state
}
