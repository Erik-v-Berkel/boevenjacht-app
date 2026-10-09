-- COP-83: Polizei-teams zien elkaar live op de kaart (net als de boeven onderling).
-- De boeven blijven voor de Polizei verborgen: de nieuwe policy geeft alleen toegang tot rijen
-- van Polizei-teams, en de bestaande policy voor boeven blijft ongewijzigd.

create function public.is_police_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.id = p_team_id and t.role = 'police')
$$;

create function public.is_police_in_game(p_game_id uuid)
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
     where p.user_id = auth.uid() and p.game_id = p_game_id and t.role = 'police'
  )
$$;

create policy "Polizei zien de locaties van alle Polizei-teams" on public.player_locations
  for select to authenticated
  using (public.is_police_team(team_id) and public.is_police_in_game(game_id));

-- Tot nu toe sloeg update_location alleen boeven op; vanaf nu ook Polizei (anders is er niets te zien).
create or replace function public.update_location(p_game_id uuid, p_lat float8, p_lng float8, p_accuracy_m float8)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_team_id   uuid;
  v_role      text;
begin
  select p.id, p.team_id, t.role into v_player_id, v_team_id, v_role
    from public.players p
    join public.teams t on t.id = p.team_id
    join public.games g on g.id = p.game_id
   where p.game_id = p_game_id and p.user_id = auth.uid()
     and g.status in ('headstart', 'running');
  if not found then
    return;
  end if;

  if v_role in ('thieves', 'police') then
    insert into public.player_locations (player_id, game_id, team_id, lat, lng, accuracy_m, updated_at)
    values (v_player_id, p_game_id, v_team_id, p_lat, p_lng, p_accuracy_m, now())
    on conflict (player_id) do update
      set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m, updated_at = now();
  end if;

  if p_accuracy_m <= 100 and not exists (
       select 1 from public.location_history
        where player_id = v_player_id and recorded_at > now() - interval '10 seconds') then
    insert into public.location_history (game_id, player_id, team_id, lat, lng)
    values (p_game_id, v_player_id, v_team_id, p_lat, p_lng);
  end if;
end;
$$;
