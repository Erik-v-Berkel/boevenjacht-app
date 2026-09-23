import { useState, type FormEvent } from 'react'
import { clockTime, eventText } from '../lib/events'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { REACTION_EMOJI, type Comment, type GameEvent, type Photo, type Player, type Reaction, type Team } from '../lib/types'

export function FeedItem({
  e,
  players,
  teams,
  photo,
  urls,
  onOpen,
  reactions,
  comments,
  meId,
}: {
  reactions?: Reaction[]
  comments?: Comment[]
  meId?: string
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
        {photo && reactions && meId && (photo.status === 'accepted' || photo.type === 'capture') && (
          <Reactions
            photoId={photo.id}
            reactions={reactions.filter((r) => r.photo_id === photo.id)}
            comments={(comments ?? []).filter((c) => c.photo_id === photo.id)}
            players={players}
            meId={meId}
          />
        )}
      </div>
      {photo && (
        <button onClick={() => onOpen(photo)} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-700">
          {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        </button>
      )}
    </div>
  )
}

function Reactions({
  photoId,
  reactions,
  comments,
  players,
  meId,
}: {
  photoId: string
  reactions: Reaction[]
  comments: Comment[]
  players: Player[]
  meId: string
}) {
  const [picking, setPicking] = useState(false)
  const [writing, setWriting] = useState(false)
  const toggle = (emoji: string) => {
    setPicking(false)
    void supabase.rpc('toggle_reaction', { p_photo_id: photoId, p_emoji: emoji })
  }
  const counts = REACTION_EMOJI.map((emoji) => {
    const rs = reactions.filter((r) => r.emoji === emoji)
    return { emoji, n: rs.length, mine: rs.some((r) => r.player_id === meId) }
  })
  return (
    <>
      <div className="mt-1 flex flex-wrap gap-1">
        {(picking ? counts : counts.filter((c) => c.n > 0)).map((c) => (
          <button
            key={c.emoji}
            onClick={() => toggle(c.emoji)}
            className={`rounded-full px-2 py-0.5 text-sm ring-1 ${c.mine ? 'bg-yellow-400/20 ring-yellow-400' : 'bg-slate-700/60 ring-slate-600'}`}
          >
            {c.emoji}
            {c.n > 0 && <span className="ml-1 text-xs tabular-nums">{c.n}</span>}
          </button>
        ))}
        {!picking && (
          <button onClick={() => setPicking(true)} aria-label="Reageren" className="rounded-full bg-slate-700/60 px-2 py-0.5 text-sm text-slate-400 ring-1 ring-slate-600">
            ☺︎+
          </button>
        )}
        {!writing && (
          <button onClick={() => setWriting(true)} aria-label="Tekst reageren" className="rounded-full bg-slate-700/60 px-2 py-0.5 text-sm text-slate-400 ring-1 ring-slate-600">
            💬
          </button>
        )}
      </div>
      {comments.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {comments.map((c) => (
            <li key={c.id} className="break-words">
              <b className={c.player_id === meId ? 'text-yellow-300' : 'text-slate-300'}>{players.find((p) => p.id === c.player_id)?.name ?? '?'}</b>{' '}
              {c.body}
            </li>
          ))}
        </ul>
      )}
      {writing && <CommentForm photoId={photoId} onDone={() => setWriting(false)} />}
    </>
  )
}

function CommentForm({ photoId, onDone }: { photoId: string; onDone: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return onDone()
    setBusy(true)
    const { error } = await supabase.rpc('add_comment', { p_photo_id: photoId, p_body: body })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setBody('')
    onDone()
  }
  return (
    <form onSubmit={send} className="mt-2 flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          autoFocus
          maxLength={140}
          enterKeyHint="send"
          className="min-w-0 flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm ring-1 ring-slate-600 outline-none focus:ring-yellow-400"
          placeholder="Reageer… (max. 140 tekens)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button disabled={busy} className="rounded-lg bg-yellow-400 px-3 text-sm font-semibold text-slate-900 disabled:opacity-40">
          {busy ? '…' : 'Stuur'}
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </form>
  )
}

export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <button className="fixed inset-0 z-[3000] grid place-items-center bg-black/90 p-4" onClick={onClose}>
      <img src={url} alt="" className="max-h-full max-w-full rounded-xl" />
    </button>
  )
}
