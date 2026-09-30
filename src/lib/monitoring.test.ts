import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react'

vi.mock('@sentry/react', () => ({ init: vi.fn() }))

describe('initMonitoring', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('doet niets zonder VITE_SENTRY_DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const { initMonitoring } = await import('./monitoring')
    expect(() => initMonitoring()).not.toThrow()
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('initialiseert Sentry met de omgeving uit VITE_APP_ENV zodra er een DSN is', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/1')
    vi.stubEnv('VITE_APP_ENV', 'production')
    const { initMonitoring } = await import('./monitoring')
    initMonitoring()
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://example@sentry.io/1', environment: 'production' }),
    )
  })
})
