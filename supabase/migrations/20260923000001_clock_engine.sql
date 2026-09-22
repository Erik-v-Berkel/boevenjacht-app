-- Fase 2: klok-engine. Starten, voorsprong, zoekklok, einde bij 0, events-tijdlijn.
-- De server is de klok: ends_at wordt alleen hier berekend (PLAN.md §2.1).

-- ---------------------------------------------------------------------------
-- Events (tijdlijn voor feed en eindoverzicht)
-- ---------------------------------------------------------------------------

create table public.events (
  id          bigserial primary key,
  game_id     uuid not null references public.games (id) on delete cascade,
  type        text not null check (type in ('game_started', 'police_released', 'bonus',
                                            'bonus_cap_reached', 'capture', 'game_ended')),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index events_game_id_idx on public.events (game_id, id);

alter table public.events enable row level security;
create policy "Spelers lezen de events van hun spel" on public.events
  for select to authenticated using (public.is_game_member(game_id));

alter publication supabase_realtime add table public.events;

-- ---------------------------------------------------------------------------
-- Tijdberekening
-- ---------------------------------------------------------------------------

-- Echte duur van een aantal spelminuten (time_scale 12 = 1 minuut in 5 seconden).
create function private.game_minutes(p_settings jsonb, p_minutes numeric)
returns interval
language sql
immutable
as $$
  select make_interval(secs => (p_minutes * 60 / (p_settings ->> 'time_scale')::numeric)::float8)
$$;

-- eindtijd = T0 + voorsprong + zoektijd − min(aftrek, plafond)
create function private.compute_ends_at(p_started_at timestamptz, p_settings jsonb, p_bonus_total_min int)
returns timestamptz
language sql
immutable
as $$
  select p_started_at + private.game_minutes(
    p_settings,
    (p_settings ->> 'headstart_min')::numeric
      + (p_settings ->> 'search_min')::numeric
      - least(greatest(p_bonus_total_min, 0), (p_settings ->> 'max_bonus_total_min')::int)
  )
$$;

-- Zet de status bij volgens de klok. De aanroeper moet de game-rij al gelockt hebben (FOR UPDATE).
create function private.sync_game(p_game public.games)
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
    update public.games set status = 'ended', winner = 'thieves' where id = v_game.id returning * into v_game;
    insert into public.events (game_id, type, payload, created_at)
    values (v_game.id, 'game_ended', jsonb_build_object('winner', 'thieves', 'reason', 'time'), v_game.ends_at);
  end if;

  return v_game;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC's
-- ---------------------------------------------------------------------------

-- Servertijd, voor de klokcorrectie op de telefoon.
create function public.server_now()
returns timestamptz
language sql
stable
as $$
  select clock_timestamp()
$$;

-- Start het spel. Alleen de eerste start telt; alle 4 teams moeten minstens 1 speler hebben.
create function public.start_game(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game    public.games;
  v_missing text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Spel niet gevonden';
  end if;
  if not exists (select 1 from public.players
                  where game_id = p_game_id and user_id = auth.uid() and team_id is not null) then
    raise exception 'Kies eerst een team';
  end if;
  if v_game.status <> 'lobby' then
    raise exception 'Het spel is al gestart';
  end if;

  select string_agg(t.name, ', ' order by t.sort) into v_missing
    from public.teams t
   where t.game_id = p_game_id
     and not exists (select 1 from public.players p where p.team_id = t.id);
  if v_missing is not null then
    raise exception 'Nog geen spelers in: %', v_missing;
  end if;

  update public.games
     set status          = 'headstart',
         started_at      = now(),
         police_start_at = now() + private.game_minutes(settings, (settings ->> 'headstart_min')::numeric),
         ends_at         = private.compute_ends_at(now(), settings, bonus_total_min)
   where id = p_game_id
  returning * into v_game;

  insert into public.events (game_id, type, payload)
  values (p_game_id, 'game_started',
          jsonb_build_object('player_id', (select id from public.players
                                            where game_id = p_game_id and user_id = auth.uid())));

  return v_game;
end;
$$;

-- Laat de server de status bijwerken (politie vrij, tijd op). Telefoons roepen dit aan zodra
-- hun lokale klok een grens passeert; zonder spelleider is er verder niemand die dat doet.
create function public.tick_game(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
begin
  if not public.is_game_member(p_game_id) then
    raise exception 'Je doet niet mee aan dit spel';
  end if;
  select * into v_game from public.games where id = p_game_id for update;
  return private.sync_game(v_game);
end;
$$;

revoke execute on function public.server_now()      from public, anon;
revoke execute on function public.start_game(uuid)  from public, anon;
revoke execute on function public.tick_game(uuid)   from public, anon;
grant  execute on function public.server_now()      to authenticated;
grant  execute on function public.start_game(uuid)  to authenticated;
grant  execute on function public.tick_game(uuid)   to authenticated;
