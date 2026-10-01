import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedItem } from './FeedItem'
import { supabase } from '../lib/supabase'
import type { GameEvent, Photo, Player, Reaction, Team } from '../lib/types'

const player: Player = { id: 'me', game_id: 'g1', team_id: 't1', user_id: 'u1', name: 'Ik', joined_at: '' } as Player
const team: Team = { id: 't1', game_id: 'g1', role: 'thieves', name: 'Boeven', color: '#000', sort: 0 } as Team
const photo: Photo = {
  id: 'p1',
  game_id: 'g1',
  player_id: 'me',
  team_id: 't1',
  type: 'beer',
  status: 'accepted',
  storage_path: 'g1/p1.jpg',
} as Photo
const event: GameEvent = { id: 1, game_id: 'g1', type: 'bonus', payload: { photo_id: 'p1' }, created_at: new Date().toISOString() }

function setup(reactions: Reaction[] = []) {
  return render(
    <FeedItem
      e={event}
      players={[player]}
      teams={[team]}
      photo={photo}
      urls={{}}
      onOpen={() => {}}
      reactions={reactions}
      comments={[]}
      meId="me"
    />,
  )
}

describe('Reactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(cleanup)

  it('toont een nieuwe reactie meteen, zonder te wachten op Realtime', async () => {
    vi.spyOn(supabase, 'rpc').mockReturnValue(Promise.resolve({ data: true, error: null }) as never)
    setup([])

    fireEvent.click(screen.getByLabelText('Reageren'))
    fireEvent.click(screen.getByText('😂'))

    // Meteen zichtbaar (optimistisch), niet pas na een herlaad vanuit de server.
    expect(await screen.findByText('1')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('toggle_reaction', { p_photo_id: 'p1', p_emoji: '😂' })
  })

  it('zet de klik terug als de server hem weigert', async () => {
    vi.spyOn(supabase, 'rpc').mockReturnValue(Promise.resolve({ data: null, error: { message: 'nope' } }) as never)
    setup([])

    fireEvent.click(screen.getByLabelText('Reageren'))
    fireEvent.click(screen.getByText('😂'))
    // Meteen zichtbaar (optimistisch), vóór de (mislukte) serverreactie.
    expect(screen.getByText('1')).toBeInTheDocument()

    // Na de mislukte RPC verdwijnt de optimistische telling weer.
    await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Reageren')).toBeInTheDocument()
  })
})
