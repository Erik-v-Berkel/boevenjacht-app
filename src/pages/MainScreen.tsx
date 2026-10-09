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
import { useOnline } from '../lib/useOnline'
import { usePush } from '../lib/push'
import { play, type SoundName } from '../lib/sound'
import type { GameEvent } from '../lib/types'
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
  const { toasts, big } = useEventToasts(data)
  const online = useOnline(game.id, me.id)
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
            <PushToggle gameId={game.id} />
            <BonusBar data={data} />
            <TeamStatus data={data} online={online} />
            <Feed data={data} me={me} />
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
            team={myTeam}
            onTap={dev ? (lat, lng) => setFakePosition({ lat, lng, accuracy: 10 }) : undefined}
          />
        )}
        {tab === 'camera' &&
          (myTeam?.role === 'thieves' ? (
            <ThiefCamera data={data} now={now} geo={geo} />
          ) : myTeam?.role === 'police' ? (
            <PoliceCamera data={data} now={now} geo={geo} team={myTeam} />
          ) : (
            <p className="mt-10 text-center text-slate-400">Je zit niet in een team, dus je kunt geen foto's maken.</p>
          ))}
        {tab === 'regels' && <Rules settings={game.settings} />}
      </main>

      {phase === 'running' && <FinalCountdown endsAt={Date.parse(game.ends_at!)} now={now} scale={game.settings.time_scale} />}
      {big && (
        <div className="pointer-events-none fixed inset-0 z-[2600] grid place-items-center bg-black/70 p-6 text-center">
          <div className="animate-pulse">
            <p className="text-8xl">{big.icon}</p>
            <p className="mt-4 text-5xl font-black text-yellow-400">{big.title}</p>
            <p className="mt-3 text-xl font-semibold">{big.text}</p>
          </div>
        </div>
      )}

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

function soundFor(e: GameEvent): SoundName | null {
  switch (e.type) {
    case 'police_released':
      return 'siren'
    case 'bonus':
      return e.payload.photo_type === 'beer' ? 'clink' : 'chime'
    case 'checkpoint':
      return 'chime'
    case 'ping':
      return 'ping'
    case 'capture':
      return 'alarm'
    case 'incident':
      return 'alarm'
    case 'out_of_bounds':
      return 'chime'
    case 'game_ended':
      return e.payload.winner === 'thieves' ? 'fanfare' : null
    default:
      return null
  }
}

/** Melding + geluid + trillen bij nieuwe gebeurtenissen; groot scherm als de Polizei mag vertrekken. */
function useEventToasts(data: GameData) {
  const [toasts, setToasts] = useState<{ id: number; icon: string; text: string }[]>([])
  const [big, setBig] = useState<{ icon: string; title: string; text: string } | null>(null)
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
    const sound = fresh.map(soundFor).find((s) => s !== null)
    if (sound) play(sound)
    if (fresh.some((e) => e.type === 'police_released')) {
      setBig({ icon: '🚨', title: 'Achtung!', text: 'Die Jagd beginnt! De Polizei mag vertrekken.' })
      setTimeout(() => setBig(null), 4000)
    }
    const added = fresh.map((e) => ({ id: e.id, ...eventText(e, data.players, data.teams) }))
    setToasts((t) => [...t, ...added])
    const ids = new Set(added.map((a) => a.id))
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 6000)
  }, [data.events, data.players, data.teams])

  return { toasts, big }
}

/** Laatste minuut (speltijd): grote rode aftelling over alle tabs, met tikjes in de laatste 10 echte seconden. */
function FinalCountdown({ endsAt, now, scale }: { endsAt: number; now: number; scale: number }) {
  const left = endsAt - now
  const secs = Math.ceil((left * scale) / 1000)
  const realSecs = Math.ceil(left / 1000)
  const lastTick = useRef<number | null>(null)
  useEffect(() => {
    if (left > 0 && realSecs <= 10 && lastTick.current !== realSecs) {
      lastTick.current = realSecs
      play('tick')
      navigator.vibrate?.(30)
    }
  }, [left, realSecs])
  if (left <= 0 || secs > 60) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[35%] z-[2400] text-center">
      <p className="text-lg font-bold text-red-300 drop-shadow">Nog even volhouden…</p>
      <p className="font-mono text-[9rem] leading-none font-black text-red-500 tabular-nums drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">{secs}</p>
    </div>
  )
}

function Countdown({ data, team, now }: { data: GameData; team: Team | null; now: number }) {
  const { game } = data
  const policeStart = Date.parse(game.police_start_at!)
  const endsAt = Date.parse(game.ends_at!)
  // In een testspel toont de grote klok speltijd (loopt time_scale× zo snel); de echte tijd staat eronder.
  const scale = game.settings.time_scale

  if (now < policeStart) {
    const left = formatDuration((policeStart - now) * scale)
    return (
      <section className="rounded-2xl bg-slate-800 p-5 text-center ring-1 ring-slate-700">
        {team?.role === 'thieves' ? (
          <>
            <p className="text-slate-300">🦹 Voorsprong — wegwezen!</p>
            <p className="font-mono text-6xl font-black tabular-nums">{left}</p>
            <p className="mt-1 text-sm text-slate-400">Daarna gaat de Polizei zoeken.</p>
          </>
        ) : (
          <>
            <p className="text-slate-300">🚓 {team ? 'Jullie mogen vertrekken over' : 'De Polizei vertrekt over'}</p>
            <p className="font-mono text-6xl font-black tabular-nums">{left}</p>
          </>
        )}
        <p className="mt-3 text-sm text-slate-400">
          Zoekklok daarna: <span className="font-mono tabular-nums">{formatDuration((endsAt - policeStart) * scale)}</span>
        </p>
        <TestHint ms={policeStart - now} timeScale={scale} />
      </section>
    )
  }

  const left = endsAt - now
  const urgent = left < gameMinutesMs(10, scale)
  return (
    <section
      className={`rounded-2xl p-5 text-center ring-1 ${urgent ? 'animate-pulse bg-red-950 ring-red-700' : 'bg-slate-800 ring-slate-700'}`}
    >
      <p className="text-slate-300">{team?.role === 'thieves' ? 'Volhouden nog' : 'Zoektijd over'}</p>
      <p className={`font-mono text-6xl font-black tabular-nums ${urgent ? 'text-red-400' : ''}`}>{formatDuration(left * scale)}</p>
      <TestHint ms={left} timeScale={scale} />
      {game.next_ping_at && Date.parse(game.next_ping_at) < endsAt && (
        <p className="mt-3 text-sm text-orange-300">
          📡 {team?.role === 'thieves' ? 'Automatische ping (tenzij jullie een foto maken) over' : 'Volgende ping over'}{' '}
          <span className="font-mono tabular-nums">{formatDuration((Date.parse(game.next_ping_at) - now) * scale)}</span>
        </p>
      )}
    </section>
  )
}

/** In een testspel: hoeveel echte tijd er nog over is. */
function TestHint({ ms, timeScale }: { ms: number; timeScale: number }) {
  if (timeScale === 1) return null
  return (
    <p className="mt-2 text-xs text-amber-400">
      Testspel, {timeScale}× sneller · echt nog: <span className="font-mono tabular-nums">{formatDuration(ms)}</span>
    </p>
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

function Feed({ data, me }: { data: GameData; me: Player }) {
  const { events, players, teams, photos, reactions } = data
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
          reactions={reactions}
          comments={data.comments}
          meId={me.id}
        />
      ))}
      {open && urls[open.storage_path] && <Lightbox url={urls[open.storage_path]} onClose={() => setOpen(null)} />}
    </section>
  )
}

/** Per team: wie heeft de app nu open? Handig om te zien of iemand een lege batterij heeft. */
function TeamStatus({ data, online }: { data: GameData; online: Set<string> }) {
  return (
    <section className="rounded-2xl bg-slate-800/60 p-3 ring-1 ring-slate-800">
      <h2 className="mb-2 text-sm font-semibold text-slate-400 uppercase">Wie is er online?</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {data.teams.map((t) => {
          const members = data.players.filter((p) => p.team_id === t.id)
          const on = members.filter((p) => online.has(p.id)).length
          return (
            <li key={t.id} className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 font-semibold" style={{ color: t.color }}>
                {t.name}
              </span>
              <span className="text-slate-400 tabular-nums">
                {on}/{members.length}
              </span>
              <span className="truncate">
                {members.map((p) => (
                  <span key={p.id} className={online.has(p.id) ? 'text-slate-100' : 'text-slate-500 line-through'}>
                    {online.has(p.id) ? '🟢' : '⚪'} {p.name}{' '}
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PushToggle({ gameId }: { gameId: string }) {
  const { state, enable } = usePush(gameId)
  const [error, setError] = useState('')
  if (state === 'on' || state === 'unsupported') return null
  if (state === 'needs-install') {
    return <p className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300">🔔 Zet de app op je beginscherm om meldingen te krijgen als je telefoon op zak zit.</p>
  }
  if (state === 'denied') {
    return <p className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-400">🔕 Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je browser.</p>
  }
  return (
    <button
      className="rounded-xl bg-slate-800 px-4 py-3 text-left font-semibold ring-1 ring-yellow-400/60"
      onClick={() => enable().catch((e) => setError(String(e?.message ?? e)))}
    >
      🔔 Meldingen aanzetten
      <span className="block text-sm font-normal text-slate-400">Ook als je telefoon op zak zit: foto's, pings en de vangst.</span>
      {error && <span className="block text-sm font-normal text-red-300">{error}</span>}
    </button>
  )
}
