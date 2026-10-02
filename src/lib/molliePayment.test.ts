import { describe, expect, it } from 'vitest'
import { buildMolliePaymentRequest, formatMollieAmount } from './molliePayment'

describe('formatMollieAmount', () => {
  it('formats cents as a 2-decimal string, never a number', () => {
    expect(formatMollieAmount(1500)).toBe('15.00')
    expect(formatMollieAmount(9000)).toBe('90.00')
    expect(formatMollieAmount(333)).toBe('3.33')
    expect(formatMollieAmount(0)).toBe('0.00')
  })
})

describe('buildMolliePaymentRequest', () => {
  const booking = {
    id: 'b-1',
    priceCentsTotal: 9000,
    cityName: 'Utrecht',
    productNameNl: 'Go',
    locale: 'nl',
  }
  const urls = { appBaseUrl: 'https://boevenjacht.nl', webhookUrl: 'https://proj.supabase.co/functions/v1/mollie-webhook' }

  it('builds a request with the amount, redirect/webhook URLs and booking metadata', () => {
    const req = buildMolliePaymentRequest(booking, urls)
    expect(req.amount).toEqual({ currency: 'EUR', value: '90.00' })
    expect(req.redirectUrl).toBe('https://boevenjacht.nl/boeken/bedankt/b-1')
    expect(req.webhookUrl).toBe(urls.webhookUrl)
    expect(req.metadata).toEqual({ booking_id: 'b-1' })
    expect(req.description).toContain('Utrecht')
    expect(req.description).toContain('Go')
  })

  it('maps locale nl -> nl_NL and anything else -> en_GB', () => {
    expect(buildMolliePaymentRequest(booking, urls).locale).toBe('nl_NL')
    expect(buildMolliePaymentRequest({ ...booking, locale: 'en' }, urls).locale).toBe('en_GB')
  })
})
