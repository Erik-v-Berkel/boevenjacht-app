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
}

export interface Game {
  id: string
  join_code: string
  status: GameStatus
  started_at: string | null
  police_start_at: string | null
  ends_at: string | null
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
