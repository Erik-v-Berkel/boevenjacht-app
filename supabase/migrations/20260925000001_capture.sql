-- Fase 5: vangen en einde. De eerste vangstfoto die de server bereikt beëindigt het spel (PLAN.md §2.3).

alter table public.games add column ended_at timestamptz;

-- sync_game zet nu ook ended_at.
create or replace function private.sync_game(p_game public.games)
returns public.games
language plpgsql
as $$
declare
  v_game public.games := p_game;
begin
  if v_game.status = 'headstart' and now() >= v_game.police_start_at then
    update public.games set status = 'running' where id = v_game.id returning * into v_game;
    insert into public.events (game_id, type, created_at)
    values (v_game.id, 'police_released', v_game.police_start_at);
  end if;

  if v_game.status in ('headstart', 'running') and now() >= v_game.ends_at then
    update public.games set status = 'ended', winner = 'thieves', ended_at = ends_at
     where id = v_game.id returning * into v_game;
    insert into public.events (game_id, type, payload, created_at)
    values (v_game.id, 'game_ended', jsonb_build_object('winner', 'thieves', 'reason', 'time'), v_game.ends_at);
  end if;

  return v_game;
end;
$$;

-- Late vangstfoto's ("Te laat, Politie A was je voor") staan wel in de galerij.
drop policy "Spelers zien geaccepteerde foto's en hun eigen afgewezen foto's" on public.photos;
create policy "Spelers zien geaccepteerde foto's, alle vangstfoto's en hun eigen afgewezen foto's" on public.photos
  for select to authenticated using (
    public.is_game_member(game_id)
    and (status = 'accepted'
         or type = 'capture'
         or player_id in (select id from public.players where user_id = auth.uid()))
  );

create function public.submit_capture(
  p_game_id      uuid,
  p_client_id    uuid,
  p_storage_path text,
  p_lat          float8,
  p_lng          float8,
  p_accuracy_m   float8
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game     public.games;
  v_player   public.players;
  v_team     public.teams;
  v_existing public.photos;
  v_photo    public.photos;
  v_reason   text;
begin
  -- Row lock: bij gelijktijdige vangstfoto's wint de eerste die de server bereikt.
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Spel niet gevonden';
  end if;
  v_game := private.sync_game(v_game);

  select * into v_player from public.players where game_id = p_game_id and user_id = auth.uid();
  if not found then
    raise exception 'Je doet niet mee aan dit spel';
  end if;
  select * into v_team from public.teams where id = v_player.team_id;
  if not found or v_team.role <> 'police' then
    raise exception 'Alleen de politie kan de boeven vangen';
  end if;

  select * into v_existing from public.photos where client_id = p_client_id;
  if found then
    if v_existing.player_id <> v_player.id then
      raise exception 'Ongeldige foto-id';
    end if;
    return jsonb_build_object('photo_id', v_existing.id, 'status', v_existing.status,
                              'reject_reason', v_existing.reject_reason, 'bonus_min', 0);
  end if;

  if split_part(coalesce(p_storage_path, ''), '/', 1) <> p_game_id::text
     or not exists (select 1 from storage.objects where bucket_id = 'photos' and name = p_storage_path) then
    raise exception 'Foto niet gevonden in de opslag';
  end if;

  if v_game.status = 'lobby' then
    raise exception 'Het spel is nog niet begonnen';
  elsif v_game.status = 'headstart' then
    raise exception 'De politie mag nog niet vertrekken';
  elsif v_game.status = 'ended' then
    v_reason := case
      when v_game.winner = 'police' then
        'Te laat, ' || (select name from public.teams where id = v_game.winning_team_id) || ' was je voor.'
      else 'Het spel is voorbij, de boeven zijn ontsnapt.'
    end;
  end if;

  insert into public.photos (client_id, game_id, player_id, team_id, type, storage_path,
                             lat, lng, accuracy_m, status, reject_reason)
  values (p_client_id, p_game_id, v_player.id, v_team.id, 'capture', p_storage_path,
          p_lat, p_lng, p_accuracy_m,
          case when v_reason is null then 'accepted' else 'rejected' end, v_reason)
  returning * into v_photo;

  if v_reason is not null then
    return jsonb_build_object('photo_id', v_photo.id, 'status', 'rejected', 'reject_reason', v_reason, 'bonus_min', 0);
  end if;

  update public.games
     set status = 'ended', winner = 'police', winning_team_id = v_team.id, ended_at = now()
   where id = p_game_id;

  insert into public.events (game_id, type, payload) values
    (p_game_id, 'capture', jsonb_build_object('photo_id', v_photo.id, 'player_id', v_player.id, 'team_id', v_team.id)),
    (p_game_id, 'game_ended', jsonb_build_object('winner', 'police', 'team_id', v_team.id, 'photo_id', v_photo.id));

  return jsonb_build_object('photo_id', v_photo.id, 'status', 'accepted', 'bonus_min', 0, 'label', v_team.name);
end;
$$;

revoke execute on function public.submit_capture(uuid, uuid, text, float8, float8, float8) from public, anon;
grant  execute on function public.submit_capture(uuid, uuid, text, float8, float8, float8) to authenticated;
