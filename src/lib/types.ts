import type { LineString, Point, Polygon } from 'geojson'

export type GameStatus = 'lobby' | 'headstart' | 'running' | 'ended'
export type TeamRole = 'thieves' | 'police'

export interface GameSettings {
  headstart_min: number
  search_min: number
  beer_bonus_min: number
  sight_bonus_min: number
  cooldown_min: number
  max_bonus_total_min: number
  bonus_during_headstart: boolean
  max_players_per_team: number
  time_scale: number
  play_area?: Polygon
  // Vanaf fase 8; oudere spellen missen ze (de server vult dan de standaardwaarden in)
  idle_ping_min?: number
  final_phase_min?: number
  final_ping_min?: number
  ping_radius_m?: number
  radars_per_team?: number
  police_teams?: number
}

export type SightGeometry = Point | LineString | Polygon

export interface Sight {
  id: number
  game_id: string
  name: string
  geometry: SightGeometry
  radius_m: number
  sort: number
}

export type PhotoType = 'beer' | 'sight' | 'capture' | 'checkpoint'

export interface Photo {
  id: string
  client_id: string
  game_id: string
  player_id: string
  team_id: string
  type: PhotoType
  storage_path: string
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  sight_id: number | null
  bar_name: string | null
  bar_name_norm: string | null
  bonus_min: number
  status: 'accepted' | 'rejected'
  reject_reason: string | null
  created_at: string
}

export interface Game {
  id: string
  join_code: string
  status: GameStatus
  started_at: string | null
  police_start_at: string | null
  ends_at: string | null
  ended_at: string | null
  next_ping_at: string | null
  bonus_total_min: number
  winner: TeamRole | null
  winning_team_id: string | null
  settings: GameSettings
  created_at: string
}

export interface Team {
  id: string
  game_id: string
  role: TeamRole
  name: string
  color: string
  sort: number
}

export interface Player {
  id: string
  game_id: string
  team_id: string | null
  user_id: string
  name: string
  joined_at: string
  last_seen_at: string
}

export type EventType = 'game_started' | 'police_released' | 'bonus' | 'bonus_cap_reached' | 'capture' | 'game_ended' | 'ping' | 'checkpoint'

export type PingKind = 'idle' | 'final' | 'radar'

/** Vage cirkel rond de boeven. lat/lng is een verschoven middelpunt; null = geen signaal. */
export interface Ping {
  id: number
  game_id: string
  kind: PingKind
  team_id: string | null
  lat: number | null
  lng: number | null
  radius_m: number
  age_s: number | null
  created_at: string
}

export const REACTION_EMOJI = ['😂', '🔥', '🍺', '👮', '😱', '👏'] as const

export interface Comment {
  id: number
  photo_id: string
  player_id: string
  game_id: string
  body: string
  created_at: string
}

export interface Reaction {
  photo_id: string
  player_id: string
  game_id: string
  emoji: string
  active: boolean
}

export interface GameEvent {
  id: number
  game_id: string
  type: EventType
  payload: Record<string, unknown>
  created_at: string
}
