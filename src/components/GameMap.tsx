import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Polygon } from 'geojson'
import type { Position } from '../lib/geo'
import type { Photo, Ping, Sight } from '../lib/types'
import { timeAgo } from '../lib/clock'
import { drawPlayArea } from './playArea'

export interface Teammate {
  name: string
  lat: number
  lng: number
}

export interface GameMapProps {
  playArea?: Polygon
  sights: Sight[]
  usedSightIds: Set<number>
  photos: Photo[] // boevenfoto's (geaccepteerd), oudste eerst
  photoUrls: Record<string, string>
  labels: Record<string, string> // photo.id → "Burgplatz" / kroegnaam
  me?: Position | null
  teammates?: Teammate[]
  pings?: Ping[] // oudste eerst; alleen de laatste paar worden getoond
  route?: boolean // lijn tussen de foto's (eindscherm)
  now: number
  onTap?: (lat: number, lng: number) => void // nep-GPS in testmodus
  className?: string
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const AVAILABLE = '#0ea5e9'
const USED = '#64748b'

export function GameMap(props: GameMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<Record<'area' | 'sights' | 'pings' | 'photos' | 'me' | 'team', L.LayerGroup> | null>(null)
  const latest = useRef(props)
  latest.current = props

  // Kaart één keer aanmaken
  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: true, zoomSnap: 0.25 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    layers.current = {
      area: L.layerGroup().addTo(m),
      sights: L.layerGroup().addTo(m),
      pings: L.layerGroup().addTo(m),
      photos: L.layerGroup().addTo(m),
      team: L.layerGroup().addTo(m),
      me: L.layerGroup().addTo(m),
    }
    m.on('click', (e: L.LeafletMouseEvent) => latest.current.onTap?.(e.latlng.lat, e.latlng.lng))
    const area = latest.current.playArea
    let userMoved = false
    const fit = () => {
      if (area) m.fitBounds(L.geoJSON(area).getBounds(), { padding: [4, 4] })
      else m.setView([51.2245, 6.772], 14)
    }
    fit()
    m.on('dragstart', () => (userMoved = true))
    map.current = m
    // Leaflet meet de container bij het aanmaken; bij een tab-wissel kan die nog 0 hoog zijn.
    const resize = new ResizeObserver(() => {
      m.invalidateSize()
      if (!userMoved) fit()
    })
    resize.observe(el.current!)
    return () => {
      resize.disconnect()
      m.remove()
      map.current = null
    }
  }, [])

  // Spelgebied
  useEffect(() => {
    const g = layers.current!.area
    g.clearLayers()
    if (props.playArea) drawPlayArea(g, props.playArea)
  }, [props.playArea])

  // Bezienswaardigheden: gekleurd = beschikbaar, grijs = gebruikt
  useEffect(() => {
    const g = layers.current!.sights
    g.clearLayers()
    for (const s of props.sights) {
      const used = props.usedSightIds.has(s.id)
      const color = used ? USED : AVAILABLE
      const style = { color, fillColor: color, fillOpacity: used ? 0.15 : 0.3, weight: 2 }
      const geo = s.geometry
      const layer =
        geo.type === 'Point'
          ? L.circle([geo.coordinates[1], geo.coordinates[0]], { ...style, radius: s.radius_m })
          : geo.type === 'LineString'
            ? L.polyline(geo.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), { color, weight: 10, opacity: used ? 0.4 : 0.6 })
            : L.polygon(geo.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]), style)
      layer.bindTooltip(`🏛️ ${escapeHtml(s.name)}${used ? ' (gebruikt)' : ''}`)
      layer.addTo(g)
    }
  }, [props.sights, props.usedSightIds])

  // Fotopins (+ route)
  useEffect(() => {
    const g = layers.current!.photos
    g.clearLayers()
    const withPos = props.photos.filter((p) => p.lat !== null && p.lng !== null)
    if (props.route && withPos.length > 1) {
      L.polyline(withPos.map((p) => [p.lat!, p.lng!] as [number, number]), { color: '#dc2626', weight: 4, dashArray: '6 8' }).addTo(g)
    }
    withPos.forEach((p, i) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="font-size:22px;line-height:32px;width:32px;height:32px;text-align:center;border-radius:9999px;background:#dc2626;border:2px solid white;box-shadow:0 1px 4px #0008">${p.type === 'beer' ? '🍺' : p.type === 'sight' ? '🏛️' : '🚨'}</div>${props.route ? `<div style="position:absolute;top:-8px;right:-8px;background:white;color:#0f172a;border-radius:9999px;font:bold 11px sans-serif;padding:1px 5px">${i + 1}</div>` : ''}`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })
      L.marker([p.lat!, p.lng!], { icon })
        .bindPopup(() => {
          const { photoUrls, labels, now } = latest.current
          const url = photoUrls[p.storage_path]
          return `<div style="width:180px">${url ? `<img src="${url}" style="width:100%;border-radius:6px" />` : ''}<b>${escapeHtml(labels[p.id] ?? '')}</b><br/>${p.bonus_min > 0 ? `−${p.bonus_min} min · ` : ''}${timeAgo(p.created_at, now)}</div>`
        })
        .addTo(g)
    })
  }, [props.photos, props.route])

  // Eigen locatie: blauwe stip met nauwkeurigheidscirkel
  useEffect(() => {
    const g = layers.current!.me
    g.clearLayers()
    if (props.me) {
      L.circle([props.me.lat, props.me.lng], { radius: props.me.accuracy, color: '#3b82f6', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(g)
      L.circleMarker([props.me.lat, props.me.lng], { radius: 8, color: 'white', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 })
        .bindTooltip('Jij')
        .addTo(g)
    }
  }, [props.me?.lat, props.me?.lng, props.me?.accuracy])

  // Teamgenoten (alleen boeven onderling)
  useEffect(() => {
    const g = layers.current!.pings
    g.clearLayers()
    const located = (props.pings ?? []).filter((p) => p.lat !== null && p.lng !== null).slice(-3)
    located.forEach((p, i) => {
      const newest = i === located.length - 1
      L.circle([p.lat!, p.lng!], {
        radius: p.radius_m,
        color: '#f97316',
        weight: newest ? 3 : 1,
        dashArray: '6 6',
        fillColor: '#f97316',
        fillOpacity: newest ? 0.25 : 0.08,
      })
        .bindTooltip(() => `📡 ${p.kind === 'radar' ? 'Radar' : 'Ping'} · ${timeAgo(p.created_at, latest.current.now)}`, { direction: 'center' })
        .addTo(g)
    })
  }, [props.pings])

  useEffect(() => {
    const g = layers.current!.team
    g.clearLayers()
    for (const t of props.teammates ?? []) {
      L.circleMarker([t.lat, t.lng], { radius: 7, color: 'white', weight: 2, fillColor: '#dc2626', fillOpacity: 1 })
        .bindTooltip(escapeHtml(t.name), { permanent: true, direction: 'top', offset: [0, -8] })
        .addTo(g)
    }
  }, [props.teammates])

  return (
    <div className={`relative ${props.className ?? 'h-full w-full'}`}>
      <div ref={el} className="h-full w-full" />
      {props.me && (
        <button
          aria-label="Naar mijn locatie"
          className="absolute top-3 right-3 z-[1000] rounded-full bg-white px-3 py-2 text-lg shadow"
          onClick={() => {
            const me = latest.current.me
            if (me) map.current?.setView([me.lat, me.lng], Math.max(map.current.getZoom(), 16))
          }}
        >
          📍
        </button>
      )}
    </div>
  )
}
