import { describe, expect, it } from 'vitest'
import { wrapTitle } from './shareCard'

describe('wrapTitle', () => {
  it('laat een korte titel op één regel staan', () => {
    expect(wrapTitle('Boeven ontsnapt!')).toEqual(['Boeven ontsnapt!'])
  })

  it('knipt een lange titel in meerdere regels zonder woorden te breken', () => {
    const lines = wrapTitle('Festgenommen! Gevangen door Politie B om 21:14.')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe('Festgenommen! Gevangen door Politie B om 21:14.')
  })

  it('respecteert een eigen regelbreedte', () => {
    expect(wrapTitle('een twee drie vier', 7)).toEqual(['een', 'twee', 'drie', 'vier'])
  })
})
