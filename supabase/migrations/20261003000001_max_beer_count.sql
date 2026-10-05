-- COP-74: optionele bovengrens op het *aantal* kroegfoto's, los van het bestaande plafond in
-- minuten (max_bonus_total_min). Nodig voor het Düsseldorf-testspel: Erik wil daar "4 kroegen
-- max" afdwingen, maar andere (stads)spellen moeten ongewijzigd blijven werken.
--
-- Niet in private.default_settings() opgenomen: die wordt met || over élk spel se settings
-- gelegd (ook bestaande), en een nieuwe sleutel daar zou dus met terugwerkende kracht een
-- plafond zetten op lopende/oude spellen. In plaats daarvan: alleen afdwingen als de sleutel
-- expliciet in p_settings is meegegeven bij create_game (zie src/pages/NewGame.tsx).

create or replace function public.submit_photo(
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
  v_max_beer   int;
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
  if v_game.settings ? 'max_beer_count' then
    v_max_beer := (v_game.settings ->> 'max_beer_count')::int;
  end if;
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

  if v_reason is null and p_type = 'beer' and v_max_beer is not null
     and (select count(*) from public.photos
           where game_id = p_game_id and status = 'accepted' and type = 'beer') >= v_max_beer then
    v_reason := 'Maximum aantal kroegfoto''s bereikt (' || v_max_beer || ')';
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
