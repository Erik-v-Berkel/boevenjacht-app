-- COP-96: aantal radars instelbaar — zowel vóór de start (create_game) als in de lobby.
-- radars_per_team: waarmee een Polizei-team start.
-- checkpoint_radars_max: hoeveel extra radars een team via controleposten kan verdienen.
-- checkpoint_radars_max stond al los in games.settings (submit_checkpoint, standaard 2 via
-- coalesce); nu ook in default_settings() zodat create_game 'm meeneemt zoals andere instellingen.

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
    'checkpoint_radars_max',  2,    -- max. extra radars per team via controleposten
    'police_teams',           3     -- 1–5
  )
$$;

-- Aantal start-radars en het plafond voor controlepost-radars aanpassen in de lobby,
-- zolang het spel niet gestart is. Zelfde opzet als set_police_teams.
create function public.set_radar_settings(p_game_id uuid, p_radars_per_team int, p_checkpoint_radars_max int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Spel niet gevonden';
  end if;
  if not public.is_game_member(p_game_id) then
    raise exception 'Je doet niet mee aan dit spel';
  end if;
  if v_game.status <> 'lobby' then
    raise exception 'Het spel is al begonnen';
  end if;
  if p_radars_per_team is null or p_radars_per_team not between 0 and 5 then
    raise exception 'Kies 0 tot 5 radars om mee te starten';
  end if;
  if p_checkpoint_radars_max is null or p_checkpoint_radars_max not between 0 and 10 then
    raise exception 'Kies 0 tot 10 extra radars via controleposten';
  end if;

  update public.games
     set settings = settings || jsonb_build_object(
           'radars_per_team', p_radars_per_team,
           'checkpoint_radars_max', p_checkpoint_radars_max)
   where id = p_game_id;
end;
$$;

revoke execute on function public.set_radar_settings(uuid, int, int) from public, anon;
grant  execute on function public.set_radar_settings(uuid, int, int) to authenticated;

-- Zelfde als in fase city_driven_game, plus dezelfde grenzen op radars_per_team en
-- checkpoint_radars_max als set_radar_settings hierboven (anders is create_game de enige
-- plek die deze twee instellingen ongevalideerd doorlaat, inclusief een eventuele null
-- die een kapot getal in de client veroorzaakt — zie NewGame.tsx).
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
  if (v_settings ->> 'radars_per_team')::int is null or (v_settings ->> 'radars_per_team')::int not between 0 and 5 then
    raise exception 'Kies 0 tot 5 start-radars';
  end if;
  if (v_settings ->> 'checkpoint_radars_max')::int is null or (v_settings ->> 'checkpoint_radars_max')::int not between 0 and 10 then
    raise exception 'Kies 0 tot 10 extra radars via controleposten';
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
