-- Fase 8: pings, radar, reacties (emoji en tekst), replay, pushmeldingen, 1–5 Polizei-teams en het Duitse thema.

-- ---------------------------------------------------------------------------
-- Instellingen en teams
-- ---------------------------------------------------------------------------

-- Nieuwe instellingen. Oudere spellen missen deze sleutels: gebruik altijd default_settings() || settings.
create or replace function private.default_settings()
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
    'time_scale',             1,
    'play_area',              private.default_play_area(),
    'idle_ping_min',          30,   -- zo lang zonder foto of ping → automatische ping
    'final_phase_min',        30,   -- laatste ... minuten: slotfase
    'final_ping_min',         10,   -- in de slotfase minstens elke ... minuten een ping
    'ping_radius_m',          300,  -- straal van de cirkel die de Polizei ziet
    'radars_per_team',        1,
    'police_teams',           3     -- 1–5
  )
$$;

-- Zelfde als in fase 3, maar met 1–5 Polizei-teams.
create or replace function public.create_game(p_admin_code text, p_settings jsonb default '{}'::jsonb)
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
  v_teams    int;
  v_letters  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_colors   constant text[] := array['#2563eb', '#059669', '#9333ea', '#0891b2', '#db2777'];
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select value into v_hash from private.app_secrets where key = 'admin_code';
  if v_hash is null or extensions.crypt(coalesce(p_admin_code, ''), v_hash) <> v_hash then
    raise exception 'Onjuiste beheerderscode';
  end if;

  select private.default_settings() || coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    into v_settings
    from jsonb_each(coalesce(p_settings, '{}'::jsonb))
   where key in (select jsonb_object_keys(private.default_settings()));

  v_teams := (v_settings ->> 'police_teams')::int;
  if v_teams is null or v_teams not between 1 and 5 then
    raise exception 'Kies 1 tot 5 Polizei-teams';
  end if;

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

  insert into public.teams (game_id, role, name, color, sort)
  values (v_game_id, 'thieves', 'Boeven', '#dc2626', 0);
  insert into public.teams (game_id, role, name, color, sort)
  select v_game_id, 'police', 'Polizei ' || chr(64 + i), v_colors[i], i
    from generate_series(1, v_teams) as i;

  perform private.copy_sights(v_game_id);

  return jsonb_build_object('game_id', v_game_id, 'join_code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Pings: de Polizei ziet een vage cirkel rond de boeven
-- ---------------------------------------------------------------------------
-- idle:  de boeven zijn idle_ping_min stil geweest (geen foto, geen ping)
-- final: slotfase, minstens elke final_ping_min een ping
-- radar: een politieteam gebruikt zijn radar; alleen dat team (en de boeven) zien de cirkel

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('game_started', 'police_released', 'bonus', 'bonus_cap_reached', 'capture', 'game_ended', 'ping'));

alter table public.games add column next_ping_at timestamptz;

create table public.pings (
  id          bigserial primary key,
  game_id     uuid not null references public.games (id) on delete cascade,
  kind        text not null check (kind in ('idle', 'final', 'radar')),
  team_id     uuid references public.teams (id) on delete cascade, -- radar: het politieteam
  lat         float8,  -- middelpunt van de cirkel (verschoven, niet de echte locatie); null = geen signaal
  lng         float8,
  radius_m    int not null,
  age_s       int,     -- hoe oud de gebruikte locatie was (echte seconden)
  created_at  timestamptz not null default now()
);
create index pings_game_id_idx on public.pings (game_id, created_at);

create function public.can_see_ping(p_game_id uuid, p_kind text, p_team_id uuid)
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
      join public.games g on g.id = p.game_id
     where p.game_id = p_game_id and p.user_id = auth.uid()
       and (p_kind <> 'radar' or p.team_id = p_team_id or t.role = 'thieves' or g.status = 'ended')
  )
$$;

alter table public.pings enable row level security;
create policy "Spelers zien de pings van hun spel (radar alleen eigen team en boeven)" on public.pings
  for select to authenticated using (public.can_see_ping(game_id, kind, team_id));

alter publication supabase_realtime add table public.pings;

-- Maakt een ping op basis van de laatst bekende locatie van de boeven (live of laatste foto).
create function private.create_ping(p_game public.games, p_kind text, p_team_id uuid)
returns public.pings
language plpgsql
as $$
declare
  v_s      jsonb := private.default_settings() || p_game.settings;
  v_radius int := (v_s ->> 'ping_radius_m')::int;
  v_lat    float8;
  v_lng    float8;
  v_at     timestamptz;
  v_center extensions.geography;
  v_ping   public.pings;
begin
  select x.lat, x.lng, x.at into v_lat, v_lng, v_at
    from (
      select l.lat, l.lng, l.updated_at as at
        from public.player_locations l
        join public.teams t on t.id = l.team_id
       where l.game_id = p_game.id and t.role = 'thieves'
      union all
      select p.lat, p.lng, p.created_at
        from public.photos p
        join public.teams t on t.id = p.team_id
       where p.game_id = p_game.id and t.role = 'thieves' and p.lat is not null
    ) x
   order by x.at desc
   limit 1;

  if v_lat is not null then
    -- Middelpunt willekeurig verschuiven: de boeven zitten ergens in de cirkel, niet in het midden.
    v_center := extensions.st_project(private.point(v_lat, v_lng), random() * v_radius * 0.6, random() * 2 * pi());
    v_lat := extensions.st_y(v_center::extensions.geometry);
    v_lng := extensions.st_x(v_center::extensions.geometry);
  end if;

  insert into public.pings (game_id, kind, team_id, lat, lng, radius_m, age_s)
  values (p_game.id, p_kind, p_team_id, v_lat, v_lng, v_radius,
          case when v_at is not null then extract(epoch from now() - v_at)::int end)
  returning * into v_ping;

  insert into public.events (game_id, type, payload)
  values (p_game.id, 'ping', jsonb_build_object(
    'ping_id', v_ping.id, 'kind', p_kind, 'team_id', p_team_id, 'located', v_lat is not null));

  return v_ping;
end;
$$;

-- Wanneer de volgende automatische ping komt. Foto's en openbare pings zetten de teller terug; de radar niet.
create function private.next_ping_at(p_game public.games)
returns timestamptz
language sql
stable
as $$
  with s as (select private.default_settings() || p_game.settings as v),
  last as (
    select greatest(
      p_game.police_start_at,
      (select max(created_at) from public.photos
        where game_id = p_game.id and status = 'accepted' and type in ('beer', 'sight')),
      (select max(created_at) from public.pings
        where game_id = p_game.id and kind <> 'radar')
    ) as at
  )
  select least(
    last.at + private.game_minutes(s.v, (s.v ->> 'idle_ping_min')::numeric),
    greatest(last.at + private.game_minutes(s.v, (s.v ->> 'final_ping_min')::numeric),
             p_game.ends_at - private.game_minutes(s.v, (s.v ->> 'final_phase_min')::numeric))
  )
  from s, last
$$;

-- Zelfde als in fase 5, plus automatische pings en next_ping_at bijhouden.
create or replace function private.sync_game(p_game public.games)
returns public.games
language plpgsql
as $$
declare
  v_game public.games := p_game;
  v_s    jsonb;
  v_next timestamptz;
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

  if v_game.status = 'running' then
    v_next := private.next_ping_at(v_game);
    if now() >= v_next then
      v_s := private.default_settings() || v_game.settings;
      perform private.create_ping(
        v_game,
        case when now() >= v_game.ends_at - private.game_minutes(v_s, (v_s ->> 'final_phase_min')::numeric)
             then 'final' else 'idle' end,
        null);
      v_next := private.next_ping_at(v_game);
    end if;
  end if;

  if v_game.next_ping_at is distinct from v_next then
    update public.games set next_ping_at = v_next where id = v_game.id returning * into v_game;
  end if;

  return v_game;
end;
$$;

create function public.use_radar(p_game_id uuid)
returns public.pings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game   public.games;
  v_player public.players;
  v_team   public.teams;
  v_s      jsonb;
begin
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
    raise exception 'Alleen de Polizei heeft een radar';
  end if;
  if v_game.status <> 'running' then
    raise exception 'De radar werkt alleen tijdens de zoektijd';
  end if;

  v_s := private.default_settings() || v_game.settings;
  if (select count(*) from public.pings where game_id = p_game_id and kind = 'radar' and team_id = v_team.id)
     >= (v_s ->> 'radars_per_team')::int then
    raise exception 'Jullie radar is al gebruikt';
  end if;

  return private.create_ping(v_game, 'radar', v_team.id);
end;
$$;

revoke execute on function public.use_radar(uuid) from public, anon;
grant  execute on function public.use_radar(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Locaties: boeven live voor elkaar, iedereen in de geschiedenis voor de replay
-- ---------------------------------------------------------------------------

create table public.location_history (
  id           bigserial primary key,
  game_id      uuid not null references public.games (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  lat          float8 not null,
  lng          float8 not null,
  recorded_at  timestamptz not null default now()
);
create index location_history_game_idx on public.location_history (game_id, recorded_at);
create index location_history_player_idx on public.location_history (player_id, recorded_at);

create function public.game_has_ended(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.games where id = p_game_id and status = 'ended')
$$;

alter table public.location_history enable row level security;
create policy "Na het spel ziet iedereen alle routes" on public.location_history
  for select to authenticated using (public.is_game_member(game_id) and public.game_has_ended(game_id));

-- Vervangt fase 7: nu voor iedereen. Alleen boeven komen in player_locations (live); iedereen in de geschiedenis.
-- last_seen_at wordt niet meer bijgewerkt: elke update liet alle telefoons het hele spel opnieuw laden.
-- Wie online is, komt nu uit Realtime Presence.
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

  if v_role = 'thieves' then
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

-- ---------------------------------------------------------------------------
-- Reacties op foto's
-- ---------------------------------------------------------------------------
-- Aan/uit via "active" in plaats van delete: Realtime levert deletes niet met een filter.

create table public.reactions (
  photo_id    uuid not null references public.photos (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete cascade,
  emoji       text not null check (emoji in ('😂', '🔥', '🍺', '👮', '😱', '👏')),
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (photo_id, player_id, emoji)
);
create index reactions_game_id_idx on public.reactions (game_id);

alter table public.reactions enable row level security;
create policy "Spelers zien de reacties in hun spel" on public.reactions
  for select to authenticated using (public.is_game_member(game_id));

alter publication supabase_realtime add table public.reactions;

create function public.toggle_reaction(p_photo_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo  public.photos;
  v_player public.players;
  v_active boolean;
begin
  select * into v_photo from public.photos where id = p_photo_id;
  if not found or not (v_photo.status = 'accepted' or v_photo.type = 'capture') then
    raise exception 'Foto niet gevonden';
  end if;
  select * into v_player from public.players where game_id = v_photo.game_id and user_id = auth.uid();
  if not found then
    raise exception 'Je doet niet mee aan dit spel';
  end if;

  insert into public.reactions (photo_id, player_id, game_id, emoji)
  values (p_photo_id, v_player.id, v_photo.game_id, p_emoji)
  on conflict (photo_id, player_id, emoji) do update
    set active = not public.reactions.active, updated_at = now()
  returning active into v_active;
  return v_active;
end;
$$;

revoke execute on function public.toggle_reaction(uuid, text) from public, anon;
grant  execute on function public.toggle_reaction(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pushmeldingen
-- ---------------------------------------------------------------------------
-- Elke nieuwe event → pg_net → Edge Function "push" → Web Push naar alle telefoons van het spel.
-- Doet niets zolang private.app_secrets geen 'push_url' en 'push_secret' heeft (zie README).

create extension if not exists pg_net;

create table public.push_subscriptions (
  endpoint    text primary key,
  player_id   uuid not null references public.players (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_game_id_idx on public.push_subscriptions (game_id);
alter table public.push_subscriptions enable row level security; -- geen policies: alleen via RPC en de Edge Function

create function public.save_push_subscription(p_game_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
begin
  select * into v_player from public.players where game_id = p_game_id and user_id = auth.uid();
  if not found then
    raise exception 'Je doet niet mee aan dit spel';
  end if;
  insert into public.push_subscriptions (endpoint, player_id, game_id, p256dh, auth)
  values (p_endpoint, v_player.id, p_game_id, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set player_id = excluded.player_id, game_id = excluded.game_id,
        p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

revoke execute on function public.save_push_subscription(uuid, text, text, text) from public, anon;
grant  execute on function public.save_push_subscription(uuid, text, text, text) to authenticated;

create function private.notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if new.type = 'game_started' then
    return new; -- iedereen staat dan toch bij elkaar
  end if;
  select value into v_url from private.app_secrets where key = 'push_url';
  select value into v_secret from private.app_secrets where key = 'push_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('event_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
  );
  return new;
end;
$$;

create trigger events_push after insert on public.events
  for each row execute function private.notify_push();

-- ---------------------------------------------------------------------------
-- Tekstreacties op foto's
-- ---------------------------------------------------------------------------

create table public.comments (
  id          bigserial primary key,
  photo_id    uuid not null references public.photos (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 140),
  created_at  timestamptz not null default now()
);
create index comments_game_id_idx on public.comments (game_id, id);

alter table public.comments enable row level security;
create policy "Spelers zien de tekstreacties in hun spel" on public.comments
  for select to authenticated using (public.is_game_member(game_id));

alter publication supabase_realtime add table public.comments;

create function public.add_comment(p_photo_id uuid, p_body text)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo   public.photos;
  v_player  public.players;
  v_body    text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  v_comment public.comments;
begin
  select * into v_photo from public.photos where id = p_photo_id;
  if not found or not (v_photo.status = 'accepted' or v_photo.type = 'capture') then
    raise exception 'Foto niet gevonden';
  end if;
  select * into v_player from public.players where game_id = v_photo.game_id and user_id = auth.uid();
  if not found then
    raise exception 'Je doet niet mee aan dit spel';
  end if;
  if char_length(v_body) not between 1 and 140 then
    raise exception 'Reactie moet 1 tot 140 tekens zijn';
  end if;
  -- Tegen per ongeluk dubbel versturen en spam
  if exists (select 1 from public.comments
              where player_id = v_player.id and created_at > now() - interval '2 seconds') then
    raise exception 'Even rustig aan…';
  end if;

  insert into public.comments (photo_id, player_id, game_id, body)
  values (p_photo_id, v_player.id, v_photo.game_id, v_body)
  returning * into v_comment;
  return v_comment;
end;
$$;

revoke execute on function public.add_comment(uuid, text) from public, anon;
grant  execute on function public.add_comment(uuid, text) to authenticated;
