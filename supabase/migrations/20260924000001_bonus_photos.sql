-- Fase 3: bonusfoto's. Bezienswaardigheden, spelgebied, fotoopslag en submit_photo met alle controles
-- (spelstatus, wachttijd, dubbele kroeg/bezienswaardigheid, geofence, plafond). PLAN.md §2.2, §3, §4.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Geo-hulpfuncties
-- ---------------------------------------------------------------------------

create function private.geog(p_geojson jsonb)
returns extensions.geography
language sql
immutable
as $$
  select extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326)::extensions.geography
$$;

create function private.point(p_lat float8, p_lng float8)
returns extensions.geography
language sql
immutable
as $$
  select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
$$;

-- ---------------------------------------------------------------------------
-- Spelgebied en bezienswaardigheden (benaderingen: controleren in Google Maps!)
-- ---------------------------------------------------------------------------

-- Rijn in het westen, Hofgarten/Kaiserstraße in het noorden, Kö/Berliner Allee in het oosten,
-- MedienHafen/Rheinturm in het zuiden. GeoJSON: [lng, lat].
create function private.default_play_area()
returns jsonb
language sql
immutable
as $$
  select '{"type":"Polygon","coordinates":[[
    [6.7700,51.2355],[6.7910,51.2345],[6.7910,51.2270],[6.7840,51.2245],[6.7835,51.2150],
    [6.7700,51.2120],[6.7560,51.2105],[6.7460,51.2125],[6.7460,51.2175],[6.7560,51.2200],
    [6.7640,51.2215],[6.7680,51.2250],[6.7690,51.2300],[6.7700,51.2355]
  ]]}'::jsonb
$$;

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
    'play_area',              private.default_play_area()
  )
$$;

-- Sjabloon; create_game kopieert dit naar sights van het nieuwe spel.
-- radius_m = hoe ver je van het punt/de lijn/de polygoon af mag staan.
create table private.sight_templates (
  id        int primary key,
  name      text not null,
  geometry  jsonb not null,
  radius_m  int not null
);

insert into private.sight_templates (id, name, geometry, radius_m) values
  (1,  'Burgplatz & Schlossturm',      '{"type":"Point","coordinates":[6.7716,51.2277]}', 75),
  (2,  'St. Lambertus Basilika',       '{"type":"Point","coordinates":[6.7729,51.2289]}', 60),
  (3,  'Rathaus & Jan-Wellem-Denkmal', '{"type":"Point","coordinates":[6.7721,51.2261]}', 60),
  (4,  'Rheinuferpromenade',           '{"type":"LineString","coordinates":[[6.7728,51.2330],[6.7712,51.2295],[6.7703,51.2270],[6.7697,51.2245],[6.7685,51.2220],[6.7665,51.2196],[6.7640,51.2180],[6.7610,51.2165]]}', 40),
  (5,  'Königsallee (Kö)',             '{"type":"LineString","coordinates":[[6.7797,51.2256],[6.7790,51.2220],[6.7783,51.2187]]}', 50),
  (6,  'Carlsplatz',                   '{"type":"Point","coordinates":[6.7745,51.2226]}', 60),
  (7,  'Hofgarten',                    '{"type":"Polygon","coordinates":[[[6.7775,51.2275],[6.7830,51.2262],[6.7880,51.2275],[6.7895,51.2310],[6.7850,51.2335],[6.7780,51.2340],[6.7750,51.2310],[6.7775,51.2275]]]}', 20),
  (8,  'K20 Kunstsammlung NRW',        '{"type":"Point","coordinates":[6.7760,51.2276]}', 60),
  (9,  'MedienHafen / Gehry-Bauten',   '{"type":"Point","coordinates":[6.7555,51.2155]}', 100),
  (10, 'Rheinturm',                    '{"type":"Point","coordinates":[6.7618,51.2179]}', 75);

create table public.sights (
  id        serial primary key,
  game_id   uuid not null references public.games (id) on delete cascade,
  name      text not null,
  geometry  jsonb not null,
  radius_m  int not null,
  sort      int not null
);
create index sights_game_id_idx on public.sights (game_id);

alter table public.sights enable row level security;
create policy "Spelers lezen de bezienswaardigheden van hun spel" on public.sights
  for select to authenticated using (public.is_game_member(game_id));

-- Bestaande create_game uitbreiden: bezienswaardigheden kopiëren.
create or replace function private.copy_sights(p_game_id uuid)
returns void
language sql
as $$
  insert into public.sights (game_id, name, geometry, radius_m, sort)
  select p_game_id, name, geometry, radius_m, id from private.sight_templates order by id
$$;

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

  perform private.copy_sights(v_game_id);

  return jsonb_build_object('game_id', v_game_id, 'join_code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Kroegnamen normaliseren (PLAN.md §4). Dezelfde regels staan in src/lib/barName.ts;
-- tests/db/photos.test.ts controleert dat beide hetzelfde opleveren.
-- ---------------------------------------------------------------------------

create function public.normalize_bar_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_clean text;
  v_words text[];
  v_result text;
begin
  v_clean := lower(coalesce(p_name, ''));
  v_clean := replace(v_clean, 'ß', 'ss');
  v_clean := translate(v_clean, 'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ', 'aaaaaaeeeeiiiiooooouuuuyycn');
  v_clean := btrim(regexp_replace(v_clean, '[^a-z0-9]+', ' ', 'g'));
  if v_clean = '' then
    return '';
  end if;

  select array_agg(w) into v_words
    from unnest(string_to_array(v_clean, ' ')) as w
   where w not in ('brauerei', 'brauhaus', 'hausbrauerei', 'gasthaus', 'zum', 'zur', 'zu', 'im', 'in',
                   'am', 'an', 'bar', 'kneipe', 'cafe', 'pub', 'die', 'der', 'das', 'de', 'het', 'the');
  v_result := array_to_string(v_words, '');
  -- Alleen stopwoorden (bv. "Bar")? Dan de hele naam gebruiken.
  return coalesce(nullif(v_result, ''), replace(v_clean, ' ', ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- Foto's
-- ---------------------------------------------------------------------------

create table public.photos (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null unique,   -- door de telefoon gekozen: opnieuw versturen telt niet dubbel
  game_id        uuid not null references public.games (id) on delete cascade,
  player_id      uuid not null references public.players (id) on delete cascade,
  team_id        uuid not null references public.teams (id) on delete cascade,
  type           text not null check (type in ('beer', 'sight', 'capture')),
  storage_path   text not null,
  lat            float8,
  lng            float8,
  accuracy_m     float8,
  sight_id       int references public.sights (id) on delete set null,
  bar_name       text,
  bar_name_norm  text,
  bonus_min      int not null default 0,
  status         text not null check (status in ('accepted', 'rejected')),
  reject_reason  text,
  created_at     timestamptz not null default now()
);
create index photos_game_id_idx on public.photos (game_id, created_at);

alter table public.photos enable row level security;
-- Afgewezen foto's ziet alleen de maker (met de reden).
create policy "Spelers zien geaccepteerde foto's en hun eigen afgewezen foto's" on public.photos
  for select to authenticated using (
    public.is_game_member(game_id)
    and (status = 'accepted'
         or player_id in (select id from public.players where user_id = auth.uid()))
  );

alter publication supabase_realtime add table public.photos;

-- Privé bucket; pad = <game_id>/<bestandsnaam>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg']);

create function public.photo_path_game_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create policy "Deelnemers uploaden foto's in hun spel" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.is_game_member(public.photo_path_game_id(name)));
create policy "Deelnemers bekijken foto's van hun spel" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_game_member(public.photo_path_game_id(name)));


-- ---------------------------------------------------------------------------
-- submit_photo: de enige manier om een foto te registreren
-- ---------------------------------------------------------------------------

create function private.format_mmss(p_interval interval)
returns text
language sql
immutable
as $$
  select (t / 60) || ':' || lpad((t % 60)::text, 2, '0')
    from (select ceil(extract(epoch from p_interval))::int as t) x
$$;

create function public.submit_photo(
  p_game_id      uuid,
  p_client_id    uuid,
  p_type         text,
  p_storage_path text,
  p_lat          float8,
  p_lng          float8,
  p_accuracy_m   float8,
  p_bar_name     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game       public.games;
  v_player     public.players;
  v_team       public.teams;
  v_existing   public.photos;
  v_photo      public.photos;
  v_point      extensions.geography;
  v_reason     text;
  v_bonus      int := 0;
  v_type_bonus int;
  v_sight_id     int;
  v_sight_name   text;
  v_sight_radius int;
  v_sight_used   boolean;
  v_sight_dist   float8;
  v_norm       text;
  v_last       timestamptz;
  v_cooldown   interval;
  v_max        int;
  v_label      text;
begin
  -- Serialiseert alles per spel: wachttijd, dubbelingen en plafond kloppen ook bij gelijktijdige foto's.
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
  if not found then
    raise exception 'Je zit niet in een team';
  end if;

  -- Opnieuw verstuurd (slecht bereik)? Geef het eerdere resultaat terug.
  select * into v_existing from public.photos where client_id = p_client_id;
  if found then
    if v_existing.player_id <> v_player.id then
      raise exception 'Ongeldige foto-id';
    end if;
    return jsonb_build_object('photo_id', v_existing.id, 'status', v_existing.status,
                              'reject_reason', v_existing.reject_reason, 'bonus_min', v_existing.bonus_min);
  end if;

  if p_type not in ('beer', 'sight') then
    raise exception 'Onbekend fototype';
  end if;
  if v_team.role <> 'thieves' then
    raise exception 'Alleen boeven kunnen bonusfoto''s maken';
  end if;
  if split_part(coalesce(p_storage_path, ''), '/', 1) <> p_game_id::text
     or not exists (select 1 from storage.objects where bucket_id = 'photos' and name = p_storage_path) then
    raise exception 'Foto niet gevonden in de opslag';
  end if;

  v_type_bonus := case p_type when 'beer' then (v_game.settings ->> 'beer_bonus_min')::int
                              else (v_game.settings ->> 'sight_bonus_min')::int end;
  v_max := (v_game.settings ->> 'max_bonus_total_min')::int;
  if p_type = 'beer' then
    v_norm := public.normalize_bar_name(p_bar_name);
  end if;

  -- Controles, in volgorde. De eerste die faalt bepaalt de reden.
  if v_game.status = 'lobby' then
    v_reason := 'Het spel is nog niet begonnen';
  elsif v_game.status = 'ended' then
    v_reason := 'Het spel is voorbij';
  elsif v_game.status = 'headstart' and not (v_game.settings ->> 'bonus_during_headstart')::boolean then
    v_reason := 'Tijdens de voorsprong tellen foto''s nog niet';
  elsif p_lat is null or p_lng is null or p_accuracy_m is null then
    v_reason := 'Geen GPS-locatie. Zet locatievoorzieningen aan.';
  elsif p_accuracy_m > 200 then
    v_reason := 'GPS nog niet nauwkeurig genoeg, even wachten…';
  end if;

  if v_reason is null then
    v_point := private.point(p_lat, p_lng);
    if v_game.settings ? 'play_area'
       and not extensions.st_covers(private.geog(v_game.settings -> 'play_area'), v_point) then
      v_reason := 'Je bent buiten het speelveld';
    end if;
  end if;

  if v_reason is null then
    select max(created_at) into v_last
      from public.photos
     where game_id = p_game_id and status = 'accepted' and type in ('beer', 'sight');
    v_cooldown := v_last + private.game_minutes(v_game.settings, (v_game.settings ->> 'cooldown_min')::numeric) - now();
    if v_cooldown > interval '0' then
      v_reason := 'Wachttijd actief: nog ' || private.format_mmss(v_cooldown);
    end if;
  end if;

  if v_reason is null and p_type = 'beer' then
    if v_norm = '' then
      v_reason := 'Vul de naam van de kroeg in';
    elsif exists (select 1 from public.photos
                   where game_id = p_game_id and status = 'accepted' and type = 'beer'
                     and bar_name_norm = v_norm) then
      v_reason := 'Deze kroeg is al gebruikt';
    elsif p_accuracy_m <= 50 and exists (
            select 1 from public.photos
             where game_id = p_game_id and status = 'accepted' and type = 'beer'
               and accuracy_m <= 50
               and extensions.st_dwithin(private.point(lat, lng), v_point, 30)) then
      v_reason := 'Deze kroeg is al gebruikt (volgens je locatie)';
    end if;
  end if;

  if v_reason is null and p_type = 'sight' then
    -- Dichtstbijzijnde nog niet gebruikte bezienswaardigheid binnen de straal.
    select s.id, s.name, s.radius_m,
           exists (select 1 from public.photos p
                    where p.game_id = p_game_id and p.status = 'accepted' and p.sight_id = s.id) as used,
           extensions.st_distance(private.geog(s.geometry), v_point) as dist
      into v_sight_id, v_sight_name, v_sight_radius, v_sight_used, v_sight_dist
      from public.sights s
     where s.game_id = p_game_id
       and extensions.st_dwithin(private.geog(s.geometry), v_point, s.radius_m)
     order by used, dist
     limit 1;

    if not found then
      v_reason := case when p_accuracy_m > 50 then 'GPS nog niet nauwkeurig genoeg, even wachten…'
                       else 'Je bent niet bij een bezienswaardigheid' end;
    elsif v_sight_used then
      v_reason := v_sight_name || ' is al gebruikt';
    elsif p_accuracy_m > greatest(v_sight_radius, 30) then
      v_reason := 'GPS nog niet nauwkeurig genoeg, even wachten…';
    end if;
  end if;

  if v_reason is null then
    v_bonus := greatest(0, least(v_type_bonus, v_max - v_game.bonus_total_min));
  end if;

  insert into public.photos (client_id, game_id, player_id, team_id, type, storage_path,
                             lat, lng, accuracy_m, sight_id, bar_name, bar_name_norm,
                             bonus_min, status, reject_reason)
  values (p_client_id, p_game_id, v_player.id, v_team.id, p_type, p_storage_path,
          p_lat, p_lng, p_accuracy_m,
          case when v_reason is null and p_type = 'sight' then v_sight_id end,
          nullif(btrim(p_bar_name), ''), v_norm,
          v_bonus, case when v_reason is null then 'accepted' else 'rejected' end, v_reason)
  returning * into v_photo;

  if v_reason is not null then
    return jsonb_build_object('photo_id', v_photo.id, 'status', 'rejected', 'reject_reason', v_reason, 'bonus_min', 0);
  end if;

  v_label := case when p_type = 'sight' then v_sight_name else btrim(p_bar_name) end;

  update public.games
     set bonus_total_min = bonus_total_min + v_bonus,
         ends_at = private.compute_ends_at(started_at, settings, bonus_total_min + v_bonus)
   where id = p_game_id
  returning * into v_game;

  insert into public.events (game_id, type, payload)
  values (p_game_id, 'bonus', jsonb_build_object(
    'photo_id', v_photo.id, 'player_id', v_player.id, 'photo_type', p_type,
    'bonus_min', v_bonus, 'label', v_label));

  if v_bonus > 0 and v_game.bonus_total_min >= v_max then
    insert into public.events (game_id, type, payload)
    values (p_game_id, 'bonus_cap_reached', jsonb_build_object('max', v_max));
  end if;

  -- Door de aftrek kan de klok (theoretisch) op 0 komen: dan winnen de boeven meteen.
  v_game := private.sync_game(v_game);

  return jsonb_build_object('photo_id', v_photo.id, 'status', 'accepted', 'bonus_min', v_bonus,
                            'label', v_label, 'ends_at', v_game.ends_at);
end;
$$;

revoke execute on function public.submit_photo(uuid, uuid, text, text, float8, float8, float8, text) from public, anon;
grant  execute on function public.submit_photo(uuid, uuid, text, text, float8, float8, float8, text) to authenticated;
