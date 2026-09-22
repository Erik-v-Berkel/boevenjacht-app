import type { Sight } from '../lib/types'
import { setFakePosition } from '../lib/useGeolocation'

// Snelkeuze voor nep-GPS in testspellen (?dev=1). Op de kaart (fase 4) kun je ook een punt aantikken.
const EXTRA: { label: string; lat: number; lng: number }[] = [
  { label: 'Kroeg: Uerige (Altstadt)', lat: 51.2263, lng: 6.774 },
  { label: 'Kroeg: Füchschen (Ratinger Str.)', lat: 51.2295, lng: 6.7745 },
  { label: 'Buiten het speelveld (Hbf)', lat: 51.22, lng: 6.794 },
]

function anchor(s: Sight): [number, number] {
  const g = s.geometry
  const c = g.type === 'Point' ? g.coordinates : g.type === 'LineString' ? g.coordinates[Math.floor(g.coordinates.length / 2)] : g.coordinates[0][0]
  if (g.type === 'Polygon') {
    const ring = g.coordinates[0]
    const lng = ring.reduce((a, p) => a + p[0], 0) / ring.length
    const lat = ring.reduce((a, p) => a + p[1], 0) / ring.length
    return [lat, lng]
  }
  return [c[1], c[0]]
}

export function DevGps({ sights }: { sights: Sight[] }) {
  const options = [
    ...sights.map((s) => ({ label: `🏛️ ${s.name}`, pos: anchor(s) })),
    ...EXTRA.map((e) => ({ label: e.label, pos: [e.lat, e.lng] as [number, number] })),
  ]
  return (
    <label className="flex flex-col gap-1 rounded-lg bg-amber-950 p-2 text-sm text-amber-200">
      🛠️ Nep-GPS (testmodus)
      <select
        className="rounded bg-slate-800 p-2 text-slate-100"
        defaultValue=""
        onChange={(e) => {
          const o = options[Number(e.target.value)]
          setFakePosition(o ? { lat: o.pos[0], lng: o.pos[1], accuracy: 10 } : null)
        }}
      >
        <option value="">Echte GPS gebruiken</option>
        {options.map((o, i) => (
          <option key={o.label} value={i}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
