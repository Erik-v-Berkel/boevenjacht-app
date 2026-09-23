-- Controlepost: een Polizei-team maakt een foto bij een bezienswaardigheid en krijgt een extra radar.
-- Elke bezienswaardigheid 1× per team, maximaal checkpoint_radars_max (standaard 2) extra radars per team.
-- Let op: de foto (en dus de locatie) is voor iedereen zichtbaar, ook voor de boeven.

alter table public.photos drop constraint photos_type_check;
alter table public.photos add constraint photos_type_check
  check (type in ('beer', 'sight', 'capture', 'checkpoint'));

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('game_started', 'police_released', 'bonus', 'bonus_cap_reached', 'capture', 'game_ended', 'ping', 'checkpoint'));

-- Aantal radars dat een team in totaal mag gebruiken: basis + geaccepteerde controleposten.
create function private.radars_allowed(p_game public.games, p_team_id uuid)
returns int
language sql
stable
as $$
  select (s.v ->> 'radars_per_team')::int
       + (select count(*)::int from public.photos
           where game_id = p_game.id and team_id = p_team_id and type = 'checkpoint' and status = 'accepted')
    from (select private.default_settings() || p_game.settings as v) s
$$;

create function public.submit_checkpoint(
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
  v_game         public.games;
  v_player       public.players;
  v_team         public.teams;
  v_existing     public.photos;
  v_photo        public.photos;
  v_point        extensions.geography;
  v_reason       text;
  v_max          int := coalesce(((select settings from public.games where id = p_game_id) ->> 'checkpoint_radars_max')::int, 2);
  v_sight_id     int;
  v_sight_name   text;
  v_sight_radius int;
  v_sight_used   boolean;
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
    raise exception 'Alleen de Polizei kan een controlepost maken';
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
    v_reason := 'Het spel is nog niet begonnen';
  elsif v_game.status = 'headstart' then
    v_reason := 'De Polizei mag nog niet vertrekken';
  elsif v_game.status = 'ended' then
    v_reason := 'Het spel is voorbij';
  elsif (select count(*) from public.photos
          where game_id = p_game_id and team_id = v_team.id and type = 'checkpoint' and status = 'accepted') >= v_max then
    v_reason := 'Jullie hebben al ' || v_max || ' controleposten gehad';
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
    -- Zelfde keuze als bij de boeven, maar "gebruikt" geldt per Polizei-team
    select s.id, s.name, s.radius_m,
           exists (select 1 from public.photos p
                    where p.game_id = p_game_id and p.team_id = v_team.id and p.type = 'checkpoint'
                      and p.status = 'accepted' and p.sight_id = s.id) as used
      into v_sight_id, v_sight_name, v_sight_radius, v_sight_used
      from public.sights s
     where s.game_id = p_game_id
       and extensions.st_dwithin(private.geog(s.geometry), v_point, s.radius_m)
     order by used, extensions.st_distance(private.geog(s.geometry), v_point)
     limit 1;

    if not found then
      v_reason := case when p_accuracy_m > 50 then 'GPS nog niet nauwkeurig genoeg, even wachten…'
                       else 'Je bent niet bij een bezienswaardigheid' end;
    elsif v_sight_used then
      v_reason := 'Jullie hadden al een controlepost bij ' || v_sight_name;
    elsif p_accuracy_m > greatest(v_sight_radius, 30) then
      v_reason := 'GPS nog niet nauwkeurig genoeg, even wachten…';
    end if;
  end if;

  insert into public.photos (client_id, game_id, player_id, team_id, type, storage_path,
                             lat, lng, accuracy_m, sight_id, status, reject_reason)
  values (p_client_id, p_game_id, v_player.id, v_team.id, 'checkpoint', p_storage_path,
          p_lat, p_lng, p_accuracy_m,
          case when v_reason is null then v_sight_id end,
          case when v_reason is null then 'accepted' else 'rejected' end, v_reason)
  returning * into v_photo;

  if v_reason is not null then
    return jsonb_build_object('photo_id', v_photo.id, 'status', 'rejected', 'reject_reason', v_reason, 'bonus_min', 0);
  end if;

  insert into public.events (game_id, type, payload)
  values (p_game_id, 'checkpoint', jsonb_build_object(
    'photo_id', v_photo.id, 'player_id', v_player.id, 'team_id', v_team.id, 'label', v_sight_name));

  return jsonb_build_object('photo_id', v_photo.id, 'status', 'accepted', 'bonus_min', 0, 'label', v_sight_name);
end;
$$;

revoke execute on function public.submit_checkpoint(uuid, uuid, text, float8, float8, float8) from public, anon;
grant  execute on function public.submit_checkpoint(uuid, uuid, text, float8, float8, float8) to authenticated;

-- Zelfde als in fase 8, maar met extra radars uit controleposten.
create or replace function public.use_radar(p_game_id uuid)
returns public.pings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game   public.games;
  v_player public.players;
  v_team   public.teams;
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

  if (select count(*) from public.pings where game_id = p_game_id and kind = 'radar' and team_id = v_team.id)
     >= private.radars_allowed(v_game, v_team.id) then
    raise exception 'Jullie radar is al gebruikt';
  end if;

  return private.create_ping(v_game, 'radar', v_team.id);
end;
$$;
