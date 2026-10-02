import { useEffect, useMemo, useState } from 'react'
import {
  fetchActiveCities,
  fetchActiveProducts,
  fetchLaunchOfferSlotsRemaining,
  startMolliePayment,
  submitBooking,
} from '../lib/stadspakketten'
import { applyLaunchOfferPreview, formatEuroCents, previewSubtotalCents } from '../pricing'
import type { City, Product } from '../lib/stadspakketTypes'

type Step = 'stad' | 'pakket' | 'gegevens'

export function BookingWizard() {
  const [cities, setCities] = useState<City[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [slotsRemaining, setSlotsRemaining] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<Step>('stad')

  const [selectedCity, setSelectedCity] = useState<City | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [participantCount, setParticipantCount] = useState(6)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [locale, setLocale] = useState<'nl' | 'en'>('nl')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchActiveCities(), fetchActiveProducts(), fetchLaunchOfferSlotsRemaining()])
      .then(([citiesData, productsData, slots]) => {
        if (cancelled) return
        setCities(citiesData)
        setProducts(productsData)
        setSlotsRemaining(slots)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Kon stadspakketten niet laden.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const preview = useMemo(() => {
    if (!selectedProduct) return null
    const subtotal = previewSubtotalCents(selectedProduct.priceCents, participantCount)
    const total = applyLaunchOfferPreview(subtotal, slotsRemaining ?? 0)
    return { subtotal, total, discounted: total < subtotal }
  }, [selectedProduct, participantCount, slotsRemaining])

  const emailLooksValid = /^\S+@\S+\.\S+$/.test(contactEmail)
  const participantsInRange =
    selectedProduct !== null &&
    participantCount >= selectedProduct.minPlayers &&
    participantCount <= selectedProduct.maxPlayers
  const canSubmit =
    selectedCity !== null &&
    selectedProduct !== null &&
    participantsInRange &&
    contactName.trim().length > 1 &&
    emailLooksValid &&
    !submitting

  async function goToCheckout(bookingId: string) {
    try {
      const { checkoutUrl } = await startMolliePayment(bookingId)
      location.href = checkoutUrl
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Betaling starten mislukt, probeer het opnieuw.')
      setSubmitting(false)
    }
  }

  async function handleSubmit() {
    if (!selectedCity || !selectedProduct || !canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const booking = await submitBooking({
        citySlug: selectedCity.slug,
        productSlug: selectedProduct.slug,
        participantCount,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        locale,
      })
      setPendingBookingId(booking.id)
      await goToCheckout(booking.id)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Boeking mislukt, probeer het opnieuw.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p className="p-6 text-center text-neutral-400">Stadspakketten laden…</p>
  }

  if (loadError) {
    return (
      <p className="p-6 text-center text-red-400" role="alert">
        {loadError}
      </p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-4 text-neutral-100">
      <ol className="flex justify-between text-xs uppercase tracking-wide text-neutral-500">
        {(['stad', 'pakket', 'gegevens'] as Step[]).map((s) => (
          <li key={s} className={s === step ? 'font-bold text-amber-400' : undefined}>
            {s}
          </li>
        ))}
      </ol>

      {step === 'stad' && (
        <section className="flex flex-col gap-3">
          <h1 className="text-xl font-bold">Kies je stad</h1>
          {cities.length === 0 && (
            <p className="text-neutral-400">Nog geen actief stadspakket beschikbaar.</p>
          )}
          {cities.map((city) => (
            <button
              key={city.id}
              type="button"
              onClick={() => {
                setSelectedCity(city)
                setStep('pakket')
              }}
              className="rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-left hover:border-amber-400"
            >
              <span className="block font-semibold">{city.name}</span>
              <span className="block text-sm text-neutral-400">{city.theme}</span>
            </button>
          ))}
        </section>
      )}

      {step === 'pakket' && selectedCity && (
        <section className="flex flex-col gap-3">
          <h1 className="text-xl font-bold">Kies je pakket — {selectedCity.name}</h1>
          {slotsRemaining !== null && slotsRemaining > 0 && (
            <p className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-300">
              Lanceeraanbod: nog {slotsRemaining} van de 10 plekken met 25% korting (in ruil voor
              een review).
            </p>
          )}
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => {
                setSelectedProduct(product)
                setParticipantCount(Math.max(product.minPlayers, participantCount))
                setStep('gegevens')
              }}
              className="rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-left hover:border-amber-400"
            >
              <span className="block font-semibold">{product.nameNl}</span>
              <span className="block text-sm text-neutral-400">
                {formatEuroCents(product.priceCents)} per persoon, excl. btw
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setStep('stad')} className="text-sm text-neutral-500 underline">
            terug
          </button>
        </section>
      )}

      {step === 'gegevens' && selectedCity && selectedProduct && (
        <section className="flex flex-col gap-4">
          <h1 className="text-xl font-bold">
            {selectedProduct.nameNl} — {selectedCity.name}
          </h1>

          <label className="flex flex-col gap-1 text-sm">
            Aantal deelnemers ({selectedProduct.minPlayers}–{selectedProduct.maxPlayers})
            <input
              type="number"
              min={selectedProduct.minPlayers}
              max={selectedProduct.maxPlayers}
              value={participantCount}
              onChange={(e) => setParticipantCount(Number(e.target.value))}
              className="rounded-md border border-neutral-700 bg-neutral-900 p-2"
            />
            {!participantsInRange && (
              <span className="text-red-400">
                Kies een aantal tussen {selectedProduct.minPlayers} en {selectedProduct.maxPlayers}.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Naam (contactpersoon)
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-900 p-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            E-mailadres
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-900 p-2"
            />
            {contactEmail.length > 0 && !emailLooksValid && (
              <span className="text-red-400">Vul een geldig e-mailadres in.</span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Taal
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'nl' | 'en')}
              className="rounded-md border border-neutral-700 bg-neutral-900 p-2"
            >
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
            </select>
          </label>

          {preview && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
              <div className="flex justify-between text-sm text-neutral-400">
                <span>Subtotaal</span>
                <span>{formatEuroCents(preview.subtotal)}</span>
              </div>
              {preview.discounted && (
                <div className="flex justify-between text-sm text-amber-400">
                  <span>Lanceerkorting (25%)</span>
                  <span>-{formatEuroCents(preview.subtotal - preview.total)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between font-semibold">
                <span>Totaal (excl. btw)</span>
                <span>{formatEuroCents(preview.total)}</span>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Definitief bedrag wordt door de server bevestigd. Hierna ga je direct door naar de
                beveiligde betaalpagina van Mollie.
              </p>
            </div>
          )}

          {submitError && (
            <div className="flex flex-col gap-2">
              <p className="text-red-400" role="alert">
                {submitError}
              </p>
              {pendingBookingId && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setSubmitting(true)
                    setSubmitError(null)
                    void goToCheckout(pendingBookingId)
                  }}
                  className="text-sm text-amber-400 underline disabled:opacity-50"
                >
                  Probeer de betaling opnieuw (boeking is al aangemaakt)
                </button>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep('pakket')} className="text-sm text-neutral-500 underline">
              terug
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="flex-1 rounded-lg bg-amber-400 p-3 font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Bezig…' : 'Naar betalen'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
