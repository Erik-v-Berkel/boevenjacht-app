import { expect, it } from 'vitest'
import { createGame, joinedPhone, newPhone, rpc, teamsOf } from './helpers'

function waitForChange(
  phone: Awaited<ReturnType<typeof newPhone>>,
  gameId: string,
  filter?: (row: { name?: string; team_id?: string }) => boolean,
) {
  return new Promise<{ ready: Promise<void>; changed: Promise<unknown> }>((resolveOuter) => {
    let onReady!: () => void
    let onChange!: (p: { new: { name?: string; team_id?: string } }) => void
    const ready = new Promise<void>((r) => (onReady = r))
    const changed = new Promise<unknown>((r) => (onChange = (p) => (filter ? filter(p.new) && r(p) : r(p))))
    phone
      .channel(`test:${gameId}:${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, onChange)
      .subscribe((s) => s === 'SUBSCRIBED' && onReady())
    resolveOuter({ ready, changed })
  })
}

// Realtime heeft na `npm run db:reset` even nodig om op te starten: daarom retry.
it('een deelnemer ziet realtime dat een ander een team kiest; een buitenstaander niet', { retry: 2, timeout: 30_000 }, async () => {
  const { game_id, join_code } = await createGame()
  const [thieves] = await teamsOf(game_id)
  const erik = await joinedPhone(join_code, 'Erik')
  const anna = await joinedPhone(join_code, 'Anna')
  const buiten = await newPhone()

  const member = await waitForChange(erik.phone, game_id, (row) => row.name === 'Anna' && row.team_id === thieves.id)
  const outsider = await waitForChange(buiten, game_id)
  await Promise.all([member.ready, outsider.ready])
  await new Promise((r) => setTimeout(r, 500))

  await rpc(anna.phone, 'choose_team', { p_game_id: game_id, p_team_id: thieves.id })

  const payload = (await member.changed) as { new: { name: string; team_id: string } }
  expect(payload.new).toMatchObject({ name: 'Anna', team_id: thieves.id })

  const leaked = await Promise.race([outsider.changed.then(() => true), new Promise((r) => setTimeout(() => r(false), 1500))])
  expect(leaked).toBe(false)
  await Promise.all([erik.phone.removeAllChannels(), buiten.removeAllChannels()])
})
