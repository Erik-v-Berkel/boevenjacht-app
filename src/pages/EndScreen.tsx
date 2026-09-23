import { useEffect, useMemo, useState } from 'react'
import { formatDuration } from '../lib/clock'
import { clockTime } from '../lib/events'
import { navigate } from '../lib/router'
import { photoLabel, thiefPhotos, usePhotoUrls } from '../lib/photos'
import type { GameData } from '../lib/useGameData'
import type { Photo, Player } from '../lib/types'
import { FeedItem, Lightbox } from '../components/FeedItem'
import { GameMap } from '../components/GameMap'
import { ReplayMap } from '../components/ReplayMap'
import { computeAwards } from '../lib/awards'
import { useLocationHistory } from '../lib/useLocationHistory'
import { Button } from '../components/ui'

export default function EndScreen({ data, me, now }: { data: GameData; me: Player; now: number }) {
  const { game, teams, photos, sights, players } = data
  // De server kan nog op "running" staan terwijl de klok al op 0 is: dan winnen de boeven.
  const winner = game.status === 'ended' ? game.winner : 'thieves'
  const winningTeam = teams.find((t) => t.id === game.winning_team_id)
  const myTeam = teams.find((t) => t.id === me.team_id)
  const capturePhoto = photos.find((p) => p.type === 'capture' && p.status === 'accepted')
  const myLateCapture = photos.find((p) => p.type === 'capture' && p.status === 'rejected' && p.player_id === me.id)
  const endedAt = game.ended_at ? Date.parse(game.ended_at) : Math.min(now, Date.parse(game.ends_at!))
  const duration = endedAt - Date.parse(game.started_at!)

  // Memo: de klok rendert elke 250 ms; nieuwe arrays zouden de kaart steeds opnieuw laten tekenen.
  const bonus = useMemo(() => thiefPhotos(photos), [photos])
  const gallery = useMemo(() => photos.filter((p) => p.status === 'accepted' || p.type === 'capture'), [photos])
  const route = useMemo(() => [...bonus, ...(capturePhoto ? [capturePhoto] : [])], [bonus, capturePhoto])
  const urls = usePhotoUrls(gallery.map((p) => p.storage_path))
  const labels = useMemo(
    () =>
      Object.fromEntries(
        gallery.map((p) => [
          p.id,
          p.type === 'capture' ? `Vangstfoto ${teams.find((t) => t.id === p.team_id)?.name ?? ''}` : photoLabel(p, sights),
        ]),
      ),
    [gallery, sights, teams],
  )
  const usedSightIds = useMemo(() => new Set(bonus.flatMap((p) => (p.sight_id ? [p.sight_id] : []))), [bonus])
  const [open, setOpen] = useState<Photo | null>(null)
  const tracks = useLocationHistory(game.id)
  const awards = useMemo(
    () =>
      computeAwards({
        players,
        teams,
        photos: photos.filter((p) => p.status === 'accepted'),
        reactions: data.reactions,
        comments: data.comments,
        pings: data.pings,
        tracks,
        labels,
      }),
    [players, teams, photos, data.reactions, data.comments, data.pings, tracks, labels],
  )

  useEffect(() => {
    const colors = winner === 'police' ? ['#2563eb', '#ffffff', '#dc2626'] : ['#dc2626', '#facc15', '#ffffff']
    void import('canvas-confetti').then(({ default: confetti }) =>
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.3 }, colors, disableForReducedMotion: true }),
    )
  }, [winner])

  const title =
    winner === 'thieves'
      ? 'Entkommen! Boeven ontsnapt!'
      : myTeam?.role === 'thieves'
        ? `Festgenommen! Jullie zijn gevangen door ${winningTeam?.name ?? 'de Polizei'} om ${clockTime(game.ended_at!)}.`
        : `Festgenommen! Gevangen door ${winningTeam?.name ?? 'de Polizei'}!`

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <header className="pt-8 text-center">
        <p className="text-7xl">{winner === 'thieves' ? '🦹' : '🚓'}</p>
        <h1 className="mt-4 text-3xl font-black">{title}</h1>
        {winner === 'police' && myTeam?.id === winningTeam?.id && <p className="mt-2 text-xl">🏆 Jullie hebben gewonnen!</p>}
      </header>

      {myLateCapture && (
        <p className="rounded-lg bg-slate-800 px-3 py-2 text-center text-slate-300 ring-1 ring-slate-700">{myLateCapture.reject_reason}</p>
      )}

      {capturePhoto && urls[capturePhoto.storage_path] && (
        <button onClick={() => setOpen(capturePhoto)}>
          <img src={urls[capturePhoto.storage_path]} alt="Vangstfoto" className="w-full rounded-2xl ring-4 ring-blue-600" />
        </button>
      )}

      <dl className="grid grid-cols-2 gap-3 text-center">
        <Stat label="Totale aftrek" value={`${game.bonus_total_min} min`} />
        <Stat label="Speelduur" value={formatDuration(duration * game.settings.time_scale)} mono />
        <Stat label="Kroegen" value={`🍺 ${bonus.filter((p) => p.type === 'beer').length}`} />
        <Stat label="Bezienswaardigheden" value={`🏛️ ${bonus.filter((p) => p.type === 'sight').length}`} />
      </dl>

      {awards.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-400 uppercase">Prijzen</h2>
          <div className="grid grid-cols-2 gap-3">
            {awards.map((a) => (
              <div key={a.title} className="rounded-xl bg-slate-800 p-3 text-center ring-1 ring-yellow-400/30">
                <p className="text-3xl">{a.icon}</p>
                <p className="text-xs font-semibold tracking-wide text-yellow-400 uppercase">{a.title}</p>
                <p className="mt-1 text-lg font-bold">{a.winner}</p>
                <p className="text-sm text-slate-400">{a.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-400 uppercase">Replay: wie liep waar?</h2>
        <ReplayMap
          tracks={tracks}
          start={Date.parse(game.started_at!)}
          end={endedAt}
          timeScale={game.settings.time_scale}
          teams={teams}
          players={players}
          photos={route}
          pings={data.pings}
          playArea={game.settings.play_area}
          fallback={
            <GameMap
              className="h-[55vh] w-full overflow-hidden rounded-2xl"
              playArea={game.settings.play_area}
              sights={sights}
              usedSightIds={usedSightIds}
              photos={route}
              photoUrls={urls}
              labels={labels}
              route
              now={now}
            />
          }
        />
      </section>

      {gallery.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-400 uppercase">Foto's ({gallery.length})</h2>
          <div className="grid grid-cols-3 gap-2">
            {gallery.map((p) => (
              <button key={p.id} onClick={() => setOpen(p)} className="relative aspect-square overflow-hidden rounded-lg bg-slate-800">
                {urls[p.storage_path] && <img src={urls[p.storage_path]} alt="" className="h-full w-full object-cover" />}
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-left text-[10px]">
                  {p.type === 'beer' ? '🍺' : p.type === 'sight' ? '🏛️' : p.type === 'checkpoint' ? '📍' : p.status === 'accepted' ? '🚨' : '⏱️'} {labels[p.id]}
                </span>
              </button>
            ))}
          </div>
          <ZipButton photos={gallery} urls={urls} labels={labels} name={`boevenjacht-${game.join_code}`} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase">Tijdlijn</h2>
        {[...data.events].reverse().map((e) => (
          <FeedItem
            key={e.id}
            e={e}
            players={players}
            teams={teams}
            photo={typeof e.payload.photo_id === 'string' && e.type !== 'game_ended' ? photos.find((p) => p.id === e.payload.photo_id) : undefined}
            urls={urls}
            onOpen={setOpen}
            reactions={data.reactions}
            comments={data.comments}
            meId={me.id}
          />
        ))}
      </section>

      <button className="text-sm text-slate-500 underline" onClick={() => navigate('/')}>
        Naar het begin
      </button>

      {open && urls[open.storage_path] && <Lightbox url={urls[open.storage_path]} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-800 p-3">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className={`text-2xl font-bold ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

const safe = (s: string) => s.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 40)

function ZipButton({ photos, urls, labels, name }: { photos: Photo[]; urls: Record<string, string>; labels: Record<string, string>; name: string }) {
  const [progress, setProgress] = useState<string | null>(null)

  const download = async () => {
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      let done = 0
      for (const [i, p] of photos.entries()) {
        setProgress(`${done}/${photos.length}`)
        const url = urls[p.storage_path]
        if (!url) continue
        const blob = await (await fetch(url)).blob()
        const time = new Date(p.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }).replace(':', 'u')
        zip.file(`${String(i + 1).padStart(2, '0')}-${time}-${safe(labels[p.id] ?? p.type)}.jpg`, blob)
        done++
      }
      setProgress('inpakken…')
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${name}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      setProgress(null)
    } catch {
      setProgress('mislukt, probeer opnieuw')
    }
  }

  return (
    <Button variant="secondary" className="mt-3" onClick={download} disabled={progress !== null && progress !== 'mislukt, probeer opnieuw'}>
      {progress && progress !== 'mislukt, probeer opnieuw' ? `Bezig… ${progress}` : "⬇️ Download alle foto's (zip)"}
      {progress === 'mislukt, probeer opnieuw' && ' — mislukt, probeer opnieuw'}
    </Button>
  )
}
