-- Fase 1: spellen, teams, spelers, lobby.
-- Alle schrijfacties lopen via security-definer RPC's; clients mogen alleen lezen (RLS).

create extension if not exists pgcrypto with schema extensions;

-- Niet-publiek schema (niet bereikbaar via de API) voor geheimen en interne helpers.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_secrets (
  key   text primary key,
  value text not null
);

-- Standaardinstellingen (PLAN.md §6). Worden bij create_game vastgelegd in games.settings.
create function private.default_settings()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'headstart_min',          15,
    'search_min',             180,
    'beer_bonus_min',         10,
    'sight_bonus_min',        15,
    'cooldown_min',           10,
    'max_bonus_total_min',    120,
    'bonus_during_headstart', true,
    'max_players_per_team',   3,
    'time_scale',             1
  )
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.games (
  id               uuid primary key default gen_random_uuid(),
  join_code        text not null unique,
  status           text not null default 'lobby'
                   check (status in ('lobby', 'headstart', 'running', 'ended')),
  started_at       timestamptz,
  police_start_at  timestamptz,
  ends_at          timestamptz,
  bonus_total_min  int not null default 0,
  winner           text check (winner in ('thieves', 'police')),
  winning_team_id  uuid,
  settings         jsonb not null,
  created_at       timestamptz not null default now()
);

create table public.teams (
  id       uuid primary key default gen_random_uuid(),
  game_id  uuid not null references public.games (id) on delete cascade,
  role     text not null check (role in ('thieves', 'police')),
  name     text not null,
  color    text not null,
  sort     int  not null,
  unique (game_id, name)
);
create index teams_game_id_idx on public.teams (game_id);

alter table public.games
  add constraint games_winning_team_id_fkey
  foreign key (winning_team_id) references public.teams (id) on delete set null;

create table public.players (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games (id) on delete cascade,
  team_id       uuid references public.teams (id) on delete set null,
  -- Anonieme Supabase-sessie; die blijft in localStorage staan, dus herladen herstelt de speler.
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 20),
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (game_id, user_id)
);
create unique index players_game_name_uniq on public.players (game_id, lower(name));
create index players_team_id_idx on public.players (team_id);
create index players_user_id_idx on public.players (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: alleen lezen binnen je eigen spel
-- ---------------------------------------------------------------------------

create function public.is_game_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players
    where game_id = p_game_id and user_id = auth.uid()
  )
$$;

alter table public.games   enable row level security;
alter table public.teams   enable row level security;
alter table public.players enable row level security;

create policy "Spelers lezen hun eigen spel" on public.games
  for select to authenticated using (public.is_game_member(id));
create policy "Spelers lezen de teams van hun spel" on public.teams
  for select to authenticated using (public.is_game_member(game_id));
create policy "Spelers lezen de spelers van hun spel" on public.players
  for select to authenticated using (public.is_game_member(game_id));

-- ---------------------------------------------------------------------------
-- RPC's
-- ---------------------------------------------------------------------------

-- Nieuw spel met de 4 vaste teams. Beveiligd met de beheerderscode uit private.app_secrets.
create function public.create_game(p_admin_code text, p_settings jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash     text;
  v_code     text;
  v_game_id  uuid;
  v_settings jsonb;
  v_letters  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';  -- zonder I en O (lijken op 1 en 0)
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select value into v_hash from private.app_secrets where key = 'admin_code';
  if v_hash is null or extensions.crypt(coalesce(p_admin_code, ''), v_hash) <> v_hash then
    raise exception 'Onjuiste beheerderscode';
  end if;

  -- Alleen bekende instellingen mogen overschreven worden.
  select private.default_settings() || coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into v_settings
    from jsonb_each(coalesce(p_settings, '{}'::jsonb))
   where key in (select jsonb_object_keys(private.default_settings()));

  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_letters, 1 + floor(random() * length(v_letters))::int, 1);
    end loop;
    v_code := v_code || lpad(floor(random() * 100)::int::text, 2, '0');
    exit when not exists (select 1 from public.games where join_code = v_code);
  end loop;

  insert into public.games (join_code, settings)
  values (v_code, v_settings)
  returning id into v_game_id;

  insert into public.teams (game_id, role, name, color, sort) values
    (v_game_id, 'thieves', 'Boeven',    '#dc2626', 0),
    (v_game_id, 'police',  'Politie A', '#2563eb', 1),
    (v_game_id, 'police',  'Politie B', '#059669', 2),
    (v_game_id, 'police',  'Politie C', '#9333ea', 3);

  return jsonb_build_object('game_id', v_game_id, 'join_code', v_code);
end;
$$;

-- Meedoen met join-code + naam. Opnieuw aanroepen met dezelfde sessie geeft dezelfde speler terug.
create function public.join_game(p_join_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game   public.games;
  v_player public.players;
  v_name   text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;
  if char_length(v_name) not between 1 and 20 then
    raise exception 'Vul een naam in (maximaal 20 tekens)';
  end if;

  select * into v_game
    from public.games
   where join_code = upper(regexp_replace(coalesce(p_join_code, ''), '\s', '', 'g'))
     for update;
  if not found then
    raise exception 'Onbekende spelcode';
  end if;

  select * into v_player
    from public.players
   where game_id = v_game.id and user_id = auth.uid();

  if found then
    if v_game.status = 'lobby' and v_player.name <> v_name then
      if exists (select 1 from public.players
                  where game_id = v_game.id and lower(name) = lower(v_name) and id <> v_player.id) then
        raise exception 'Deze naam is al in gebruik';
      end if;
      update public.players set name = v_name where id = v_player.id;
    end if;
    return jsonb_build_object('game_id', v_game.id, 'player_id', v_player.id);
  end if;

  if v_game.status <> 'lobby' then
    raise exception 'Dit spel is al begonnen';
  end if;
  if exists (select 1 from public.players
              where game_id = v_game.id and lower(name) = lower(v_name)) then
    raise exception 'Deze naam is al in gebruik';
  end if;

  insert into public.players (game_id, user_id, name)
  values (v_game.id, auth.uid(), v_name)
  returning * into v_player;

  return jsonb_build_object('game_id', v_game.id, 'player_id', v_player.id);
end;
$$;

-- Team kiezen of wisselen (null = uit je team stappen). Alleen in de lobby, max. spelers per team.
-- De row lock op het spel voorkomt dat twee spelers tegelijk de laatste plek pakken.
create function public.choose_team(p_game_id uuid, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game   public.games;
  v_player public.players;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Spel niet gevonden';
  end if;

  select * into v_player
    from public.players
   where game_id = p_game_id and user_id = auth.uid();
  if not found then
    raise exception 'Je doet niet mee aan dit spel';
  end if;

  if v_game.status <> 'lobby' then
    raise exception 'Het spel is al begonnen, wisselen kan niet meer';
  end if;

  if p_team_id is not null and p_team_id is distinct from v_player.team_id then
    if not exists (select 1 from public.teams where id = p_team_id and game_id = p_game_id) then
      raise exception 'Onbekend team';
    end if;
    if (select count(*) from public.players where team_id = p_team_id)
       >= (v_game.settings ->> 'max_players_per_team')::int then
      raise exception 'Dit team is vol';
    end if;
  end if;

  update public.players set team_id = p_team_id where id = v_player.id;
end;
$$;

revoke execute on function public.create_game(text, jsonb) from public, anon;
revoke execute on function public.join_game(text, text)    from public, anon;
revoke execute on function public.choose_team(uuid, uuid)  from public, anon;
grant  execute on function public.create_game(text, jsonb) to authenticated;
grant  execute on function public.join_game(text, text)    to authenticated;
grant  execute on function public.choose_team(uuid, uuid)  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.games, public.teams, public.players;
