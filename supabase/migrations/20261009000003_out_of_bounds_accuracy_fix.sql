-- COP-84 fix: de "buiten het speelveld"-melding gebruikte een accuracy-grens van 100 m
-- die player_locations (en dus de kaart) niet heeft. Resultaat gezien in de praktijk: een
-- Polizei-team was duidelijk zichtbaar buiten het speelveld op de kaart van de andere
-- Polizei-teams, maar niemand kreeg de melding — hun GPS-fix was preciezer dan 100 m voor de
-- kaart maar de melding bleef toch stil (reëel voorbeeld: een fix net boven de 100 m-grens in
-- de binnenstad). De melding moet exact dezelfde positie beoordelen als wat al op de kaart
-- staat, dus de aparte accuracy-check verdwijnt hier.

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
  v_settings  jsonb;
  v_outside   boolean;
begin
  select p.id, p.team_id, t.role, g.settings into v_player_id, v_team_id, v_role, v_settings
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

  -- Buiten-het-gebied-melding: beoordeelt dezelfde p_lat/p_lng die net in player_locations is
  -- gezet, zonder extra accuracy-eis — anders kan de melding zwijgen terwijl de kaart het team
  -- al buiten het speelveld toont (zoals hiervoor gebeurde met een grens van 100 m).
  -- Geen "select ... for update": dat botst met de FOR KEY SHARE-lock die elke insert in
  -- player_locations/location_history al op deze teams-rij legt (foreign key naar teams.id)
  -- en gaf onder load een deadlock (zie capaciteitstest). Een gewone update (FOR NO KEY UPDATE)
  -- botst daar niet mee; de kleine race (twee gelijktijdige vertrekken geven 2 events in plaats
  -- van 1) is onschuldig voor een melding.
  if v_role in ('thieves', 'police') and v_settings ? 'play_area' then
    v_outside := not extensions.st_covers(private.geog(v_settings -> 'play_area'), private.point(p_lat, p_lng));
    if v_outside then
      update public.teams set outside_area_since = now() where id = v_team_id and outside_area_since is null;
      if found then
        insert into public.events (game_id, type, payload)
        values (p_game_id, 'out_of_bounds', jsonb_build_object('team_id', v_team_id));
      end if;
    else
      update public.teams set outside_area_since = null where id = v_team_id and outside_area_since is not null;
    end if;
  end if;
end;
$$;
