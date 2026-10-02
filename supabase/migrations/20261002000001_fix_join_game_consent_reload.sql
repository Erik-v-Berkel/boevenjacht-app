-- COP-67: fix "join_game eist opnieuw akkoord bij herladen, ook als speler al akkoord gaf".
--
-- join_game() (20260930000005_safety.sql) controleerde p_consent = true vóórdat het keek of de
-- speler al bestond. Het commentaar bij die migratie zegt expliciet dat bestaande spelers met
-- een oudere consent-versie gewoon moeten kunnen blijven meedoen, en dat alleen nieuw
-- joinen/hernoemen de nieuwste versie vastzet — maar de check gooide een fout voor élke aanroep
-- zonder p_consent: true, ook voor een speler die al consent_accepted_at had staan. Dat
-- blokkeerde de normale "herladen tijdens het spel"-flow zodra de client niet opnieuw consent
-- meestuurde.
--
-- Fix: verplaats de consent-check naar ná de lookup van de bestaande speler en laat 'm alleen
-- gelden voor de insert-tak (nieuwe speler), consistent met het commentaar dat al in de
-- migratie stond. De backfill-update voor een bestaande speler zonder consent_accepted_at
-- krijgt dezelfde coalesce(p_consent, false)-check, zodat die nooit stilletjes "akkoord"
-- vastlegt zonder dat de speler dat ook echt gaf.

create or replace function public.join_game(
  p_join_code       text,
  p_name            text,
  p_consent         boolean default false,
  p_consent_version text default null
)
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
    if v_player.consent_accepted_at is null and coalesce(p_consent, false) then
      update public.players
         set consent_accepted_at = now(), consent_version = p_consent_version
       where id = v_player.id;
    end if;
    return jsonb_build_object('game_id', v_game.id, 'player_id', v_player.id);
  end if;

  if v_game.status <> 'lobby' then
    raise exception 'Dit spel is al begonnen';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Je moet akkoord gaan met de voorwaarden en de eigen-risicoverklaring om mee te doen';
  end if;
  if exists (select 1 from public.players
              where game_id = v_game.id and lower(name) = lower(v_name)) then
    raise exception 'Deze naam is al in gebruik';
  end if;

  insert into public.players (game_id, user_id, name, consent_accepted_at, consent_version)
  values (v_game.id, auth.uid(), v_name, now(), p_consent_version)
  returning * into v_player;

  return jsonb_build_object('game_id', v_game.id, 'player_id', v_player.id);
end;
$$;
