import { describe, expect, it } from 'vitest'
import { isValidJoinCode, joinLink, normalizeJoinCode } from '../../src/lib/joinCode'

describe('join-code', () => {
  it('normaliseert hoofdletters en spaties', () => {
    expect(normalizeJoinCode(' bier 42 ')).toBe('BIER42')
  })

  it('herkent geldige codes', () => {
    expect(isValidJoinCode('BIER42')).toBe(true)
    expect(isValidJoinCode('BIER4')).toBe(false)
    expect(isValidJoinCode('bier42')).toBe(false)
  })

  it('bouwt de deellink', () => {
    expect(joinLink('https://boevenjacht.vercel.app', 'bier42')).toBe('https://boevenjacht.vercel.app/j/BIER42')
  })
})
