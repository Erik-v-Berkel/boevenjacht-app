import { describe, expect, it } from 'vitest'
import { applyLaunchOfferPreview, formatEuroCents, previewSubtotalCents } from './pricing'

describe('pricing preview (client-side estimate, server submit_booking is authoritative)', () => {
  it('multiplies price per person by participant count', () => {
    expect(previewSubtotalCents(1500, 6)).toBe(9000)
  })

  it('never returns a negative subtotal for a negative participant count', () => {
    expect(previewSubtotalCents(1500, -3)).toBe(0)
  })

  it('applies 25% lanceeraanbod korting when slots remain', () => {
    expect(applyLaunchOfferPreview(9000, 4)).toBe(6750)
  })

  it('applies no korting when no launch-offer slots remain', () => {
    expect(applyLaunchOfferPreview(9000, 0)).toBe(9000)
  })

  it('formats cents as euros excl. btw display string', () => {
    expect(formatEuroCents(6750)).toBe('€ 67,50')
  })
})
