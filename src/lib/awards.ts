import { meters, pointAt, trackDistance, type Tracks } from './trackMath'
import type { Comment, Photo, Ping, Player, Reaction, Team } from './types'

export interface Award {
  icon: string
  title: string
  winner: string
  detail: string
}

interface Input {
  players: Player[]
  teams: Team[]
  photos: Photo[] // geaccepteerde foto's
  reactions: Reaction[] // alleen actieve
  comments: Comment[]
  pings: Ping[]
  tracks: Tracks | null
  labels: Record<string, string> // photo.id → omschrijving
}

const km = (m: number) => `${(m / 1000).toFixed(1).replace('.', ',')} km`

function maxBy<T>(items: T[], score: (x: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, x) => (best === undefined || score(x) > score(best) ? x : best), undefined)
}

/** Prijzen voor het eindscherm. Een prijs zonder winnaar (bv. geen reacties) wordt overgeslagen. */
export function computeAwards({ players, teams, photos, reactions, comments, pings, tracks, labels }: Input): Award[] {
  const awards: Award[] = []
  const name = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? '?'
  const teamName = (teamId: string | null) => teams.find((t) => t.id === teamId)?.name ?? '?'
  const thiefTeamIds = new Set(teams.filter((t) => t.role === 'thieves').map((t) => t.id))

  // Gelopen afstand
  if (tracks) {
    const walked = [...tracks.entries()].filter(([, tr]) => tr.length > 1).map(([id, tr]) => ({ id, m: trackDistance(tr) }))
    const most = maxBy(walked, (w) => w.m)
    if (most && most.m >= 100) awards.push({ icon: '🥾', title: 'Wandelkampioen', winner: name(most.id), detail: km(most.m) })
    const least = maxBy(walked, (w) => -w.m)
    if (walked.length >= 2 && least && least.id !== most?.id) {
      awards.push({ icon: '🐌', title: 'Stilzitter', winner: name(least.id), detail: km(least.m) })
    }
  }

  // Foto met de meeste reacties (emoji + tekst)
  const score = (p: Photo) => reactions.filter((r) => r.photo_id === p.id).length + comments.filter((c) => c.photo_id === p.id).length
  const favourite = maxBy(photos, score)
  if (favourite && score(favourite) > 0) {
    awards.push({
      icon: '😂',
      title: 'Publiekslieveling',
      winner: name(favourite.player_id),
      detail: `${labels[favourite.id] ?? 'foto'}: ${score(favourite)} reacties`,
    })
  }

  // Meeste tekstreacties
  const talkers = players.map((p) => ({ p, n: comments.filter((c) => c.player_id === p.id).length }))
  const talker = maxBy(talkers, (x) => x.n)
  if (talker && talker.n > 0) awards.push({ icon: '💬', title: 'Kletskous', winner: talker.p.name, detail: `${talker.n} reacties` })

  // Meeste kroegen
  const drinkers = players.map((p) => ({ p, n: photos.filter((f) => f.type === 'beer' && f.player_id === p.id).length }))
  const drinker = maxBy(drinkers, (x) => x.n)
  if (drinker && drinker.n > 0) awards.push({ icon: '🍺', title: 'Kroegtijger', winner: drinker.p.name, detail: `${drinker.n}× Prost` })

  // Radar die het dichtst bij de boeven uitkwam
  if (tracks) {
    const thiefTracks = [...tracks.entries()]
      .filter(([id]) => thiefTeamIds.has(players.find((p) => p.id === id)?.team_id ?? ''))
      .map(([, tr]) => tr)
    const radars = pings
      .filter((p) => p.kind === 'radar' && p.lat !== null && p.lng !== null)
      .map((p) => {
        const t = Date.parse(p.created_at)
        const ds = thiefTracks.flatMap((tr) => {
          const at = pointAt(tr, t)
          return at ? [meters(at, { lat: p.lat!, lng: p.lng! })] : []
        })
        return { p, d: ds.length ? Math.min(...ds) : Infinity }
      })
      .filter((x) => Number.isFinite(x.d))
    const best = maxBy(radars, (x) => -x.d)
    if (best) awards.push({ icon: '📡', title: 'Radar-Glückspilz', winner: teamName(best.p.team_id), detail: `${Math.round(best.d)} m naast de boeven` })
  }

  // Meeste controleposten
  const posts = teams
    .filter((t) => t.role === 'police')
    .map((t) => ({ t, n: photos.filter((p) => p.type === 'checkpoint' && p.team_id === t.id).length }))
  const post = maxBy(posts, (x) => x.n)
  if (post && post.n > 0) awards.push({ icon: '📍', title: 'Controle-freak', winner: post.t.name, detail: `${post.n} controleposten` })

  return awards
}
