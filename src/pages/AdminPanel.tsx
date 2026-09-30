import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { photoLabel, usePhotoUrls } from '../lib/photos'
import { Button, ErrorText, inputClass } from '../components/ui'
import type { AdminAction, AdminGameSummary, Game, GameStatus, Photo, Player, Sight, Team } from '../lib/types'

const STATUS_LABEL: Record<GameStatus, string> = {
  lobby: 'Lobby',
  headstart: 'Voorsprong',
  running: 'Zoektijd',
  ended: 'Afgelopen',
}

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'medium' }) : '—')

/** Eigen knop i.p.v. Button-variant: bg-red-600 via className zou door Tailwinds vaste
 * volgorde van kleurutilities (…, red, …, yellow, …) overstemd kunnen worden door de
 * primary-variant zijn bg-yellow-400. */
function DangerButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`w-full rounded-xl bg-red-600 px-4 py-3 text-lg font-semibold text-white transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/** Beheerscherm (COP-6): spellenlijst, eindtijd aanpassen, foto afkeuren, spel stoppen — zonder SQL. */
export default function AdminPanel() {
  const [gameId, setGameId] = useState<string | null>(null)
  return gameId ? <AdminGameDetail gameId={gameId} onBack={() => setGameId(null)} /> : <AdminGameList onOpen={setGameId} />
}

function useAdminGames() {
  const [games, setGames] = useState<AdminGameSummary[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('admin_game_summary').select('*').order('created_at', { ascending: false })
    if (error) return setError(errorMessage(error))
    setError('')
    setGames(data ?? [])
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('admin:games')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [load])

  return { games, error, reload: load }
}

function AdminGameList({ onOpen }: { onOpen: (id: string) => void }) {
  const { games, error, reload } = useAdminGames()

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <h1 className="text-xl font-bold text-slate-100">Beheer · Spellen</h1>
      <ErrorText>{error}</ErrorText>
      {games === null ? (
        <p className="text-slate-400">Laden…</p>
      ) : games.length === 0 ? (
        <p className="text-slate-400">Nog geen spellen.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((g) => (
            <li key={g.id}>
              <button
                onClick={() => onOpen(g.id)}
                className="flex w-full flex-col gap-1 rounded-xl bg-slate-800/60 p-3 text-left ring-1 ring-slate-800 hover:ring-yellow-400/60"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-bold text-slate-100">{g.join_code}</span>
                  <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-200">{STATUS_LABEL[g.status]}</span>
                </div>
                <p className="text-sm text-slate-400">
                  {g.player_count} spelers · 🍺🏛️ {g.accepted_photo_count} geaccepteerd, {g.rejected_photo_count} afgekeurd
                </p>
                <p className="text-sm text-slate-400">
                  Eindtijd: {dt(g.ends_at)}
                  {g.status === 'ended' && ` · Winnaar: ${g.winner === 'thieves' ? 'boeven' : g.winner === 'police' ? 'politie' : 'gestopt door beheer'}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" onClick={() => void reload()}>
        Vernieuwen
      </Button>
    </div>
  )
}

interface DetailData {
  game: Game
  teams: Team[]
  players: Player[]
  photos: Photo[]
  sights: Sight[]
  actions: AdminAction[]
}

function useAdminGameDetail(gameId: string) {
  const [data, setData] = useState<DetailData | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [g, t, p, ph, s, a] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).maybeSingle(),
      supabase.from('teams').select('*').eq('game_id', gameId).order('sort'),
      supabase.from('players').select('*').eq('game_id', gameId).order('joined_at'),
      supabase.from('photos').select('*').eq('game_id', gameId).order('created_at', { ascending: false }),
      supabase.from('sights').select('*').eq('game_id', gameId).order('sort'),
      supabase.from('admin_actions').select('*').eq('game_id', gameId).order('created_at', { ascending: false }),
    ])
    const err = g.error ?? t.error ?? p.error ?? ph.error ?? s.error ?? a.error
    if (err) return setError(errorMessage(err))
    if (!g.data) return setError('Spel niet gevonden')
    setError('')
    setData({ game: g.data, teams: t.data ?? [], players: p.data ?? [], photos: ph.data ?? [], sights: s.data ?? [], actions: a.data ?? [] })
  }, [gameId])

  useEffect(() => {
    void load()
    const byGame = `game_id=eq.${gameId}`
    const channel = supabase
      .channel(`admin:game:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos', filter: byGame }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_actions', filter: byGame }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [gameId, load])

  return { data, error, reload: load }
}

function AdminGameDetail({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const { data, error, reload } = useAdminGameDetail(gameId)

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <button className="self-start text-sm text-slate-400 underline" onClick={onBack}>
        ← Terug naar spellenlijst
      </button>
      <ErrorText>{error}</ErrorText>
      {!data ? (
        <p className="text-slate-400">Laden…</p>
      ) : (
        <>
          <header>
            <h1 className="font-mono text-2xl font-bold text-slate-100">{data.game.join_code}</h1>
            <p className="text-slate-400">
              {STATUS_LABEL[data.game.status]} · gestart {dt(data.game.started_at)} · eindtijd {dt(data.game.ends_at)}
            </p>
          </header>

          <EndsAtForm game={data.game} onDone={reload} />
          <StopGameButton game={data.game} onDone={reload} />
          <PhotoReview photos={data.photos} players={data.players} teams={data.teams} sights={data.sights} onDone={reload} />
          <ActionLog actions={data.actions} />
        </>
      )}
    </div>
  )
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EndsAtForm({ game, onDone }: { game: Game; onDone: () => void }) {
  const editable = game.status === 'headstart' || game.status === 'running'
  const [value, setValue] = useState(() => (game.ends_at ? toLocalInputValue(game.ends_at) : ''))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setValue(game.ends_at ? toLocalInputValue(game.ends_at) : '')
  }, [game.ends_at])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!value) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('admin_set_ends_at', {
      p_game_id: game.id,
      p_ends_at: new Date(value).toISOString(),
      p_reason: reason.trim() || null,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setReason('')
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-slate-800/60 p-3 ring-1 ring-slate-800">
      <h2 className="text-sm font-semibold text-slate-400 uppercase">Eindtijd aanpassen</h2>
      {!editable && <p className="text-sm text-slate-500">Alleen aan te passen tijdens de voorsprong of de zoektijd.</p>}
      <input type="datetime-local" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} disabled={!editable} />
      <input
        type="text"
        placeholder="Reden (optioneel, voor de logboek)"
        className={inputClass}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={!editable}
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={!editable || busy || !value}>
        {busy ? 'Bezig…' : 'Eindtijd opslaan'}
      </Button>
    </form>
  )
}

function StopGameButton({ game, onDone }: { game: Game; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stoppable = game.status !== 'ended'

  const stop = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('admin_stop_game', { p_game_id: game.id, p_reason: reason.trim() || null })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setConfirming(false)
    setReason('')
    onDone()
  }

  if (!stoppable) {
    return (
      <div className="rounded-xl bg-slate-800/60 p-3 ring-1 ring-slate-800">
        <h2 className="text-sm font-semibold text-slate-400 uppercase">Spel stoppen</h2>
        <p className="mt-1 text-sm text-slate-500">Dit spel is al voorbij.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-red-950/40 p-3 ring-1 ring-red-900">
      <h2 className="text-sm font-semibold text-red-300 uppercase">Spel stoppen</h2>
      {!confirming ? (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Spel stoppen
        </Button>
      ) : (
        <>
          <p className="text-sm text-red-200">Weet je het zeker? Het spel eindigt direct, zonder winnaar. Dit kan niet ongedaan gemaakt worden.</p>
          <input
            type="text"
            placeholder="Reden (optioneel, voor de logboek)"
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)} disabled={busy}>
              Annuleren
            </Button>
            <DangerButton className="flex-1" onClick={() => void stop()} disabled={busy}>
              {busy ? 'Bezig…' : 'Ja, stop het spel'}
            </DangerButton>
          </div>
        </>
      )}
    </div>
  )
}

function PhotoReview({
  photos,
  players,
  teams,
  sights,
  onDone,
}: {
  photos: Photo[]
  players: Player[]
  teams: Team[]
  sights: Sight[]
  onDone: () => void
}) {
  const urls = usePhotoUrls(photos.map((p) => p.storage_path))
  const reviewable = photos.filter((p) => p.type !== 'capture')

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-slate-400 uppercase">Foto's ({reviewable.length})</h2>
      {reviewable.length === 0 ? (
        <p className="text-sm text-slate-500">Nog geen foto's.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reviewable.map((p) => (
            <PhotoRow
              key={p.id}
              photo={p}
              url={urls[p.storage_path]}
              player={players.find((pl) => pl.id === p.player_id)}
              team={teams.find((t) => t.id === p.team_id)}
              label={photoLabel(p, sights)}
              onDone={onDone}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function PhotoRow({
  photo,
  url,
  player,
  team,
  label,
  onDone,
}: {
  photo: Photo
  url?: string
  player?: Player
  team?: Team
  label: string
  onDone: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reject = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('admin_reject_photo', { p_photo_id: photo.id, p_reason: reason.trim() || null })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setConfirming(false)
    setReason('')
    onDone()
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-slate-800/60 p-3 ring-1 ring-slate-800">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-700">
          {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-100">
            {photo.type === 'beer' ? '🍺' : photo.type === 'sight' ? '🏛️' : '📍'} {label}
          </p>
          <p className="text-sm text-slate-400">
            {player?.name ?? '?'} ({team?.name ?? '?'}) · {new Date(photo.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-sm text-slate-400">
            {photo.status === 'accepted' ? `✅ Geaccepteerd${photo.bonus_min > 0 ? ` (−${photo.bonus_min} min)` : ''}` : `❌ Afgekeurd: ${photo.reject_reason}`}
          </p>
        </div>
      </div>
      {photo.status === 'accepted' &&
        (!confirming ? (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Afkeuren
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Reden (optioneel)"
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)} disabled={busy}>
                Annuleren
              </Button>
              <DangerButton className="flex-1" onClick={() => void reject()} disabled={busy}>
                {busy ? 'Bezig…' : 'Ja, afkeuren'}
              </DangerButton>
            </div>
          </div>
        ))}
    </li>
  )
}

function ActionLog({ actions }: { actions: AdminAction[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-slate-400 uppercase">Logboek ({actions.length})</h2>
      {actions.length === 0 ? (
        <p className="text-sm text-slate-500">Nog geen beheeracties voor dit spel.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {actions.map((a) => (
            <li key={a.id} className="rounded-lg bg-slate-800/40 px-3 py-2 text-slate-300">
              <span className="text-slate-500">{dt(a.created_at)}</span> · <b>{actionLabel(a.action)}</b> door {a.actor_email}
              {typeof a.payload.reason === 'string' && a.payload.reason && <> — {a.payload.reason}</>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function actionLabel(action: AdminAction['action']): string {
  switch (action) {
    case 'end_time_changed':
      return 'Eindtijd aangepast'
    case 'photo_rejected':
      return 'Foto afgekeurd'
    case 'game_stopped':
      return 'Spel gestopt'
  }
}
