import L from 'leaflet'
import type { Polygon } from 'geojson'

// Heel de wereld, als buitenrand voor het "masker" rond het speelveld
const WORLD: [number, number][] = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
]

/** Speelveld tekenen: alles erbuiten donkerder, met een dikke rode rand (zwart omlijnd voor contrast). */
export function drawPlayArea(target: L.LayerGroup | L.Map, area: Polygon) {
  const ring = area.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number])
  L.polygon([WORLD, ring], { stroke: false, fillColor: '#000', fillOpacity: 0.3, interactive: false }).addTo(target)
  L.polygon(ring, { color: '#000', weight: 8, opacity: 0.6, fill: false, interactive: false }).addTo(target)
  L.polygon(ring, { color: '#dc2626', weight: 4, opacity: 1, fill: false, dashArray: '14 8', interactive: false }).addTo(target)
}
