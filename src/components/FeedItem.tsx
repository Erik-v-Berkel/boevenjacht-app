import { clockTime, eventText } from '../lib/events'
import type { GameEvent, Photo, Player, Team } from '../lib/types'

export function FeedItem({
  e,
  players,
  teams,
  photo,
  urls,
  onOpen,
}: {
  e: GameEvent
  players: Player[]
  teams: Team[]
  photo?: Photo
  urls: Record<string, string>
  onOpen: (p: Photo) => void
}) {
  const { icon, text } = eventText(e, players, teams)
  const url = photo && urls[photo.storage_path]
  return (
    <div className="flex gap-3 rounded-xl bg-slate-800/60 p-3 ring-1 ring-slate-800">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <p>{text}</p>
        <p className="text-xs text-slate-500">{clockTime(e.created_at)}</p>
      </div>
      {photo && (
        <button onClick={() => onOpen(photo)} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-700">
          {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        </button>
      )}
    </div>
  )
}

export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <button className="fixed inset-0 z-[3000] grid place-items-center bg-black/90 p-4" onClick={onClose}>
      <img src={url} alt="" className="max-h-full max-w-full rounded-xl" />
    </button>
  )
}
