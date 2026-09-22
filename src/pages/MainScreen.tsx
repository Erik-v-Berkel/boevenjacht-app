import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration, gameMinutesMs, needsTick, phaseAt } from '../lib/clock'
import { useServerClock, useServerNow } from '../lib/useServerClock'
import type { GameData } from '../lib/useGameData'
import type { GameEvent, Photo, Player, Team } from '../lib/types'
import { usePhotoUrls } from '../lib/photos'
import { insidePlayArea } from '../lib/geo'
import { devModeAllowed, setFakePosition, useGeolocation } from '../lib/useGeolocation'
import MapTab from './MapTab'
import { Rules } from '../components/Rules'
import EndScreen from './EndScreen'
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

  // Zonder spelleider: elke telefoon vraagt de server om bij te werken zodra de klok een grens passeert.
  const lastTick = useRef(0)
  useEffect(() => {
    if (needsTick(game, now) && Date.now() - lastTick.current > 3000) {
      lastTick.current = Date.now()
      // Let op: een Supabase-query wordt pas verstuurd bij then/await.
      supabase.rpc('tick_game', { p_game_id: game.id }).then(() => {})
    }
  }, [game, now])

  if (phase === 'ended') return <EndScreen data={data} now={now} />

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex flex-1 flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
        {outside && tab !== 'kaart' && (
          <p className="rounded-lg bg-amber-950 px-3 py-2 text-amber-200 ring-1 ring-amber-800">⚠️ Je bent buiten het speelveld</p>
        )}
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
            onTap={dev ? (lat, lng) => setFakePosition({ lat, lng, accuracy: 10 }) : undefined}
          />
        )}
        {tab === 'camera' &&
          (myTeam?.role === 'thieves' ? (
            <ThiefCamera data={data} now={now} geo={geo} />
          ) : myTeam?.role === 'police' ? (
            <PoliceCamera data={data} now={now} />
          ) : (
            <Placeholder text="Je zit niet in een team, dus je kunt geen foto's maken." />
          ))}
        {tab === 'regels' && <Rules settings={game.settings} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
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

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

export function eventText(e: GameEvent, players: Player[], teams: Team[]): { icon: string; text: string } {
  switch (e.type) {
    case 'game_started': {
      const who = players.find((p) => p.id === e.payload.player_id)?.name
      return { icon: '🏁', text: `Spel gestart${who ? ` door ${who}` : ''}. De boeven zijn vertrokken!` }
    }
    case 'police_released':
      return { icon: '🚓', text: 'De politie mag vertrekken!' }
    case 'bonus': {
      const who = players.find((p) => p.id === e.payload.player_id)?.name
      const icon = e.payload.photo_type === 'beer' ? '🍺' : '🏛️'
      const min = Number(e.payload.bonus_min)
      return { icon, text: `Boeven${who ? ` (${who})` : ''}: ${min > 0 ? `−${min} min` : 'foto'} bij ${e.payload.label}` }
    }
    case 'bonus_cap_reached':
      return { icon: '🧢', text: `Maximale aftrek bereikt (${e.payload.max} min). Foto's leveren de boeven geen tijd meer op.` }
    case 'game_ended': {
      if (e.payload.winner === 'thieves') return { icon: '🦹', text: 'De tijd is op. De boeven zijn ontsnapt!' }
      const team = teams.find((t) => t.id === e.payload.team_id)?.name ?? 'de politie'
      return { icon: '🚨', text: `Boeven gevangen door ${team}!` }
    }
    default:
      return { icon: '•', text: e.type }
  }
}

function Feed({ data }: { data: GameData }) {
  const { events, players, teams, photos } = data
  const photoById = new Map(photos.map((p) => [p.id, p]))
  const urls = usePhotoUrls(photos.filter((p) => p.status === 'accepted').map((p) => p.storage_path))
  const [open, setOpen] = useState<Photo | null>(null)

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-slate-400 uppercase">Feed</h2>
      {events.map((e) => {
        const { icon, text } = eventText(e, players, teams)
        const photo = typeof e.payload.photo_id === 'string' ? photoById.get(e.payload.photo_id) : undefined
        const url = photo && urls[photo.storage_path]
        return (
          <div key={e.id} className="flex gap-3 rounded-xl bg-slate-800/60 p-3 ring-1 ring-slate-800">
            <span className="text-2xl">{icon}</span>
            <div className="flex-1">
              <p>{text}</p>
              <p className="text-xs text-slate-500">{clockTime(e.created_at)}</p>
            </div>
            {photo && (
              <button onClick={() => setOpen(photo)} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-700">
                {url && <img src={url} alt="" className="h-full w-full object-cover" />}
              </button>
            )}
          </div>
        )
      })}
      {open && urls[open.storage_path] && (
        <button className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          <img src={urls[open.storage_path]} alt="" className="max-h-full max-w-full rounded-xl" />
        </button>
      )}
    </section>
  )
}

function PoliceCamera({ data, now }: { data: GameData; now: number }) {
  const policeStart = Date.parse(data.game.police_start_at!)
  if (now < policeStart) {
    return <Placeholder text={`De camera is geblokkeerd tot jullie mogen vertrekken (nog ${formatDuration(policeStart - now)}).`} />
  }
  return <Placeholder text="Vangstfoto maken komt in een volgende versie." />
}

function Placeholder({ text }: { text: string }) {
  return <p className="mt-10 text-center text-slate-400">{text}</p>
}
