/**
 * Prijs-preview voor de checkout-UI: geeft direct feedback terwijl iemand het
 * deelnemersaantal wijzigt. De definitieve prijs (incl. lanceeraanbod) wordt
 * altijd opnieuw en autoritatief berekend door submit_booking() op de server —
 * dit is nooit de beslissende prijs, zie src/geofence.ts voor hetzelfde patroon.
 */
export function previewSubtotalCents(pricePerPersonCents: number, participantCount: number): number {
  return pricePerPersonCents * Math.max(0, participantCount)
}

export function applyLaunchOfferPreview(subtotalCents: number, slotsRemaining: number): number {
  if (slotsRemaining <= 0) return subtotalCents
  return Math.round(subtotalCents * 0.75)
}

export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}
