import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration, gameMinutesMs, needsTick, phaseAt } from '../lib/clock'
import { eventText } from '../lib/events'
import { insidePlayArea } from '../lib/geo'
import { usePhotoUrls } from '../lib/photos'
import { useServerClock, useServerNow } from '../lib/useServerClock'
import { devModeAllowed, setFakePosition, useGeolocation } from '../lib/useGeolocation'
import { useWakeLock } from '../lib/useWakeLock'
import { useTeamLocations } from '../lib/useTeamLocations'
import type { GameData } from '../lib/useGameData'
import type { Photo, Player, Team } from '../lib/types'
import { Rules } from '../components/Rules'
import { FeedItem, Lightbox } from '../components/FeedItem'
import EndScreen from './EndScreen'
import MapTab from './MapTab'
import PoliceCamera from './PoliceCamera'
import ThiefCamera from './ThiefCamera'

type Tab = 'klok' | 'kaart' | 'camera' | 'regels'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'klok', label: 'Klok & feed', icon: '⏱️' },
  { id: 'kaart', label: 'Kaart', icon: '🗺️' },
  { id: 'camera', label: 'Camera', icon: '📷' },
  { id: 'regels', label: 'Regels', icon: '📜' },
]

export default function MainScreen({ data, me }: { data: GameData; me: Player }) {
  const { game } = data
  const offset = useServerClock()
  const now = useServerNow(offset)
  const phase = phaseAt(game, now)
  const [tab, setTab] = useState<Tab>('klok')
  const myTeam = data.teams.find((t) => t.id === me.team_id) ?? null
  const dev = devModeAllowed(game.settings.time_scale)
  const geo = useGeolocation(dev)
  const outside = geo.kind === 'ok' && !insidePlayArea(game.settings.play_area, geo.pos.lat, geo.pos.lng)
  const team = useTeamLocations(data, me, myTeam, geo, phase !== 'ended')
  const toasts = useEventToasts(data)
  useWakeLock(phase !== 'ended')

  // Zonder spelleider: elke telefoon vraagt de server om bij te werken zodra de klok een grens passeert.
  const lastTick = useRef(0)
  useEffect(() => {
    if (needsTick(game, now) && Date.now() - lastTick.current > 3000) {
      lastTick.current = Date.now()
      // Let op: een Supabase-query wordt pas verstuurd bij then/await.
      supabase.rpc('tick_game', { p_game_id: game.id }).then(() => {})
    }
  }, [game, now])

  if (phase === 'ended') return <EndScreen data={data} me={me} now={now} />

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex flex-1 flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
        {tab !== 'kaart' && outside && <Banner color="amber">⚠️ Je bent buiten het speelveld</Banner>}
        {tab !== 'kaart' && team.warning && <Banner color="red">{team.warning}</Banner>}
        {tab === 'klok' && (
          <>
            <Countdown data={data} team={myTeam} now={now} />
            <BonusBar data={data} />
            <Feed data={data} />
          </>
        )}
        {tab === 'kaart' && (
          <MapTab
            data={data}
            now={now}
            geo={geo}
            outside={outside}
            teammates={team.teammates}
            banner={team.warning}
            onTap={dev ? (lat, lng) => setFakePosition({ lat, lng, accuracy: 10 }) : undefined}
          />
        )}
        {tab === 'camera' &&
          (myTeam?.role === 'thieves' ? (
            <ThiefCamera data={data} now={now} geo={geo} />
          ) : myTeam?.role === 'police' ? (
            <PoliceCamera data={data} now={now} geo={geo} />
          ) : (
            <p className="mt-10 text-center text-slate-400">Je zit niet in een team, dus je kunt geen foto's maken.</p>
          ))}
        {tab === 'regels' && <Rules settings={game.settings} />}
      </main>

      <div className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[2000] mx-auto flex max-w-md flex-col gap-2 px-3">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-xl bg-yellow-400 px-4 py-3 font-semibold text-slate-900 shadow-lg">
            {t.icon} {t.text}
          </div>
        ))}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-[1500] border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center py-2 text-xs ${tab === t.id ? 'text-yellow-400' : 'text-slate-400'}`}
            >
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

function Banner({ color, children }: { color: 'amber' | 'red'; children: React.ReactNode }) {
  const cls = color === 'amber' ? 'bg-amber-950 text-amber-200 ring-amber-800' : 'bg-red-950 text-red-200 ring-red-800'
  return <p className={`rounded-lg px-3 py-2 font-semibold ring-1 ${cls}`}>{children}</p>
}

/** Melding + trillen bij nieuwe gebeurtenissen (foto's, politie vrij, vangst). */
function useEventToasts(data: GameData) {
  const [toasts, setToasts] = useState<{ id: number; icon: string; text: string }[]>([])
  const lastSeen = useRef<number | null>(null)

  useEffect(() => {
    const newest = data.events[0]?.id ?? 0
    if (lastSeen.current === null) {
      lastSeen.current = newest // bij openen geen oude meldingen
      return
    }
    const fresh = data.events.filter((e) => e.id > lastSeen.current!).reverse()
    lastSeen.current = Math.max(lastSeen.current, newest)
    if (fresh.length === 0) return
    navigator.vibrate?.([200, 100, 200])
    const added = fresh.map((e) => ({ id: e.id, ...eventText(e, data.players, data.teams) }))
    setToasts((t) => [...t, ...added])
    const ids = new Set(added.map((a) => a.id))
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 6000)
  }, [data.events, data.players, data.teams])

  return toasts
}

function Countdown({ data, team, now }: { data: GameData; team: Team | null; now: number }) {
  const { game } = data
  const policeStart = Date.parse(game.police_start_at!)
  const endsAt = Date.parse(game.ends_at!)

  if (now < policeStart) {
    const left = formatDuration(policeStart - now)
    return (
      <section className="rounded-2xl bg-slate-800 p-5 text-center ring-1 ring-slate-700">
        {team?.role === 'thieves' ? (
          <>
            <p className="text-slate-300">🦹 Voorsprong — wegwezen!</p>
            <p className="font-mono text-6xl font-black tabular-nums">{left}</p>
            <p className="mt-1 text-sm text-slate-400">Daarna gaat de politie zoeken.</p>
          </>
        ) : (
          <>
            <p className="text-slate-300">🚓 {team ? 'Jullie mogen vertrekken over' : 'De politie vertrekt over'}</p>
            <p className="font-mono text-6xl font-black tabular-nums">{left}</p>
          </>
        )}
        <p className="mt-3 text-sm text-slate-400">
          Zoekklok daarna: <span className="font-mono tabular-nums">{formatDuration(endsAt - policeStart)}</span>
        </p>
      </section>
    )
  }

  const left = endsAt - now
  const urgent = left < gameMinutesMs(10, game.settings.time_scale)
  return (
    <section
      className={`rounded-2xl p-5 text-center ring-1 ${urgent ? 'animate-pulse bg-red-950 ring-red-700' : 'bg-slate-800 ring-slate-700'}`}
    >
      <p className="text-slate-300">{team?.role === 'thieves' ? 'Volhouden nog' : 'Zoektijd over'}</p>
      <p className={`font-mono text-6xl font-black tabular-nums ${urgent ? 'text-red-400' : ''}`}>{formatDuration(left)}</p>
    </section>
  )
}

function BonusBar({ data }: { data: GameData }) {
  const max = data.game.settings.max_bonus_total_min
  const total = Math.min(data.game.bonus_total_min, max)
  return (
    <section>
      <p className="mb-1 text-sm text-slate-300">
        Boeven hebben al <b>{total}</b> / {max} min afgetrokken
      </p>
      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-red-500 transition-all" style={{ width: `${(total / max) * 100}%` }} />
      </div>
    </section>
  )
}

function Feed({ data }: { data: GameData }) {
  const { events, players, teams, photos } = data
  const photoById = new Map(photos.map((p) => [p.id, p]))
  const urls = usePhotoUrls(photos.filter((p) => p.status === 'accepted').map((p) => p.storage_path))
  const [open, setOpen] = useState<Photo | null>(null)

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-slate-400 uppercase">Feed</h2>
      {events.map((e) => (
        <FeedItem
          key={e.id}
          e={e}
          players={players}
          teams={teams}
          photo={typeof e.payload.photo_id === 'string' ? photoById.get(e.payload.photo_id) : undefined}
          urls={urls}
          onOpen={setOpen}
        />
      ))}
      {open && urls[open.storage_path] && <Lightbox url={urls[open.storage_path]} onClose={() => setOpen(null)} />}
    </section>
  )
}
