-- Fase 7 (optioneel): boeven zien elkaar op de kaart en krijgen "Blijf bij elkaar!".
-- Live locaties staan in een aparte tabel, zodat alleen teamgenoten van het boeventeam ze kunnen lezen.
-- De politie ziet ze nooit (PLAN.md §2.3, §6).

create table public.player_locations (
  player_id   uuid primary key references public.players (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete cascade,
  team_id     uuid not null references public.teams (id) on delete cascade,
  lat         float8 not null,
  lng         float8 not null,
  accuracy_m  float8,
  updated_at  timestamptz not null default now()
);
create index player_locations_team_id_idx on public.player_locations (team_id);

-- Zit ik zelf in dit team, en is het het boeventeam?
create function public.is_my_thief_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.players p
      join public.teams t on t.id = p.team_id
     where p.user_id = auth.uid() and p.team_id = p_team_id and t.role = 'thieves'
  )
$$;

alter table public.player_locations enable row level security;
create policy "Boeven zien de locaties van hun teamgenoten" on public.player_locations
  for select to authenticated using (public.is_my_thief_team(team_id));

alter publication supabase_realtime add table public.player_locations;

-- Alleen boeven sturen hun locatie, en alleen zolang het spel loopt.
create function public.update_location(p_game_id uuid, p_lat float8, p_lng float8, p_accuracy_m float8)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
begin
  select p.* into v_player
    from public.players p
    join public.teams t on t.id = p.team_id
    join public.games g on g.id = p.game_id
   where p.game_id = p_game_id and p.user_id = auth.uid()
     and t.role = 'thieves' and g.status in ('headstart', 'running');
  if not found then
    return;
  end if;

  update public.players set last_seen_at = now() where id = v_player.id;
  insert into public.player_locations (player_id, game_id, team_id, lat, lng, accuracy_m, updated_at)
  values (v_player.id, p_game_id, v_player.team_id, p_lat, p_lng, p_accuracy_m, now())
  on conflict (player_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m, updated_at = now();
end;
$$;

revoke execute on function public.update_location(uuid, float8, float8, float8) from public, anon;
grant  execute on function public.update_location(uuid, float8, float8, float8) to authenticated;
