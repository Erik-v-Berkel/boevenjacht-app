-- Koppelt het live spel (sights/games.settings.play_area) aan een stadspakket
-- (cities/city_points_of_interest), zodat create_game per stad kan draaien in plaats van
-- altijd de hardgecodeerde Düsseldorf-sjabloon (private.sight_templates) te gebruiken.
-- Achtergrond: docs/stadspakket-data-model.md, COP-3.
--
-- Achterwaarts compatibel: create_game zonder p_city_slug gedraagt zich exact als voorheen
-- (private.sight_templates + private.default_play_area()) — bestaande spellen en de huidige
-- NewGame-flow blijven ongewijzigd werken.
--
-- Nog niet gedekt door deze migratie (vervolgwerk, zie COP-3-issue):
-- submit_photo toetst foto's alleen tegen settings.play_area, nog niet tegen
-- city_forbidden_zones (spoor/water/bouwplaats/privéterrein/drukke weg). Die tabel is er al
-- (20260930000002_stadspakketten.sql) maar wordt nog nergens gelezen door de spellogica.

-- city_points_of_interest had nog geen straal; sights.radius_m is verplicht voor de foto-geofence
-- (PLAN.md §3). 60 m is de meest voorkomende straal in de bestaande Düsseldorf-sjabloon.
alter table city_points_of_interest
  add column if not exists radius_m int not null default 60;

comment on column city_points_of_interest.radius_m is
  'Straal in meters voor de foto-geofence van een bezienswaardigheid. Voor lijnen/gebieden is dit '
  'een benadering rond het opgeslagen punt — de echte lijn/gebied-omvang staat dan in description.';

create or replace function private.copy_sights_from_city(p_game_id uuid, p_city_id uuid)
returns void
language sql
as $$
  insert into public.sights (game_id, name, geometry, radius_m, sort)
  select p_game_id,
         coalesce(name_nl, name_en, 'Bezienswaardigheid'),
         extensions.st_asgeojson(location)::jsonb,
         radius_m,
         sort_order
    from city_points_of_interest
   where city_id = p_city_id
     and kind = 'bezienswaardigheid'
   order by sort_order
$$;

-- Signatuur wijzigt (extra p_city_slug-parameter): de oude 2-argumenten-functie eerst weghalen,
-- anders ontstaat er een dubbelzinnige overload (beide zouden voor een 2-argumenten-aanroep passen).
drop function if exists public.create_game(text, jsonb);

create or replace function public.create_game(
  p_admin_code text,
  p_settings jsonb default '{}'::jsonb,
  p_city_slug text default null
)
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
  v_city_id  uuid;
  v_red_line extensions.geography;
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

  if p_city_slug is not null then
    select id, red_line into v_city_id, v_red_line
      from public.cities
     where slug = p_city_slug
       and status <> 'archived';
    if v_city_id is null then
      raise exception 'Onbekend of gearchiveerd stadspakket: %', p_city_slug;
    end if;
    v_settings := jsonb_set(v_settings, '{play_area}', extensions.st_asgeojson(v_red_line)::jsonb);
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

  if v_city_id is not null then
    perform private.copy_sights_from_city(v_game_id, v_city_id);
  else
    perform private.copy_sights(v_game_id);
  end if;

  return jsonb_build_object('game_id', v_game_id, 'join_code', v_code);
end;
$$;

revoke execute on function public.create_game(text, jsonb, text) from public, anon;
grant  execute on function public.create_game(text, jsonb, text) to authenticated;
