export interface City {
  id: string
  slug: string
  name: string
  theme: string
  defaultLocale: 'nl' | 'en'
}

export type ProductSlug = 'go' | 'business_self' | 'business_host'

export interface Product {
  id: string
  slug: ProductSlug
  nameNl: string
  nameEn: string | null
  priceCents: number
  requiresHost: boolean
  minPlayers: number
  maxPlayers: number
}

export interface BookingDraft {
  citySlug: string
  productSlug: ProductSlug
  participantCount: number
  contactName: string
  contactEmail: string
  locale: 'nl' | 'en'
}

export interface BookingResult {
  id: string
  priceCentsTotal: number
  launchOfferApplied: boolean
  status: string
}
