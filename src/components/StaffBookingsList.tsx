import { useEffect, useState } from 'react'
import { fetchStaffBookings, type StaffBooking } from '../lib/staffBookings'
import { formatEuroCents } from '../pricing'
import { ErrorText } from './ui'

const statusLabels: Record<string, string> = {
  pending: 'Nog te bevestigen',
  confirmed: 'Bevestigd',
  cancelled: 'Geannuleerd',
}

export function StaffBookingsList() {
  const [bookings, setBookings] = useState<StaffBooking[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchStaffBookings()
      .then(setBookings)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!bookings) return <p className="text-slate-400">Boekingen laden…</p>
  if (bookings.length === 0) return <p className="text-slate-400">Nog geen boekingen.</p>

  return (
    <ul className="flex flex-col gap-3">
      {bookings.map((booking) => (
        <li key={booking.id} className="rounded-xl bg-slate-800 p-3 ring-1 ring-slate-700">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-slate-100">{booking.contactName}</span>
            <span className="text-sm text-slate-400">{statusLabels[booking.status] ?? booking.status}</span>
          </div>
          <p className="text-sm text-slate-300">
            {booking.cityName} · {booking.productName} · {booking.participantCount} deelnemers
          </p>
          <p className="text-sm text-slate-400">{booking.contactEmail}</p>
          <p className="text-sm text-slate-400">{formatEuroCents(booking.priceCentsTotal)} excl. btw</p>
        </li>
      ))}
    </ul>
  )
}
