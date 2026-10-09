import { describe, expect, it } from 'vitest'
import { EMERGENCY_BUTTON_HIDDEN_UNTIL, isEmergencyButtonHidden } from '../../src/lib/safety'

describe('isEmergencyButtonHidden', () => {
  it('is verborgen vóór de hide-until datum en weer zichtbaar erna', () => {
    const hideUntil = Date.parse(EMERGENCY_BUTTON_HIDDEN_UNTIL)
    expect(isEmergencyButtonHidden(hideUntil - 1)).toBe(true)
    expect(isEmergencyButtonHidden(hideUntil)).toBe(false)
    expect(isEmergencyButtonHidden(hideUntil + 1)).toBe(false)
  })
})
