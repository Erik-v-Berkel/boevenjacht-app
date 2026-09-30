import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

/**
 * Stuurt onafgehandelde fouten naar Sentry. Zonder VITE_SENTRY_DSN (bv. lokaal
 * of tijdens een weekendspel op de oude omgeving) doet dit niets — zo blijft
 * de weekendversie los van het Sentry-project van de productieomgeving.
 */
export function initMonitoring(): void {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'production',
    tracesSampleRate: 0,
  })
}
