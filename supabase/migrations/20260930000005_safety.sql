-- Veiligheid (COP-7, week 4): akkoord op voorwaarden + eigen-risicoverklaring bij het joinen
-- (vastgelegd met tijdstip, afgedwongen in join_game) en een noodknop die een melding
-- logt en (optioneel) doorstuurt naar beheer.

-- ---------------------------------------------------------------------------
-- Akkoord bij het joinen
-- ---------------------------------------------------------------------------
-- consent_version verwijst naar de tekst in veiligheid.md (src/lib/safety.ts heeft dezelfde
-- tekst client-side). Verandert de tekst, dan verhoogt de versie en vraagt de app opnieuw
-- akkoord (huidige spelers met een oudere versie blijven gewoon meedoen; alleen nieuw
-- joinen/hernoemen zet de nieuwste versie vast).

alter table public.players
  add column consent_accepted_at timestamptz,
  add column consent_version     text;

-- Zelfde als in fase 1/8, met verplicht akkoord op de veiligheidsverklaring. Nieuwe
-- parameters (p_consent, p_consent_version) veranderen de functiehandtekening, dus de oude
-- versie moet weg — anders blijft die als los overload bestaan en zou je het akkoord kunnen
-- omzeilen door de oude 2-argumenten-vorm aan te roepen.
drop function if exists public.join_game(text, text);

create function public.join_game(
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
  if not coalesce(p_consent, false) then
    raise exception 'Je moet akkoord gaan met de voorwaarden en de eigen-risicoverklaring om mee te doen';
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
    if v_player.consent_accepted_at is null then
      update public.players
         set consent_accepted_at = now(), consent_version = p_consent_version
       where id = v_player.id;
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

  insert into public.players (game_id, user_id, name, consent_accepted_at, consent_version)
  values (v_game.id, auth.uid(), v_name, now(), p_consent_version)
  returning * into v_player;

  return jsonb_build_object('game_id', v_game.id, 'player_id', v_player.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Noodknop: 112 bellen doet de telefoon zelf (tel:112); dit legt de melding vast
-- en waarschuwt (optioneel) beheer. Nooit een reden om op de melding te wachten
-- voor het bellen van 112 — dat regelt de app-tekst, niet de database.
-- ---------------------------------------------------------------------------

create table public.incidents (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  team_id     uuid references public.teams (id) on delete set null,
  lat         float8,
  lng         float8,
  called_112  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index incidents_game_id_idx on public.incidents (game_id, created_at);

alter table public.incidents enable row level security;
create policy "Spelers zien de noodmeldingen van hun spel" on public.incidents
  for select to authenticated using (public.is_game_member(game_id));

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('game_started', 'police_released', 'bonus', 'bonus_cap_reached', 'capture', 'game_ended', 'ping', 'checkpoint', 'incident'));

create function public.report_incident(p_game_id uuid, p_lat float8 default null, p_lng float8 default null, p_called_112 boolean default false)
returns public.incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player   public.players;
  v_incident public.incidents;
begin
  select * into v_player from public.players where game_id = p_game_id and user_id = auth.uid();
  if not found then
    raise exception 'Je doet niet mee aan dit spel';
  end if;

  insert into public.incidents (game_id, player_id, team_id, lat, lng, called_112)
  values (p_game_id, v_player.id, v_player.team_id, p_lat, p_lng, coalesce(p_called_112, false))
  returning * into v_incident;

  insert into public.events (game_id, type, payload)
  values (p_game_id, 'incident', jsonb_build_object(
    'incident_id', v_incident.id, 'player_id', v_player.id, 'team_id', v_player.team_id, 'called_112', v_incident.called_112));

  return v_incident;
end;
$$;

revoke execute on function public.join_game(text, text, boolean, text) from public, anon;
revoke execute on function public.report_incident(uuid, float8, float8, boolean) from public, anon;
grant  execute on function public.join_game(text, text, boolean, text) to authenticated;
grant  execute on function public.report_incident(uuid, float8, float8, boolean) to authenticated;

alter publication supabase_realtime add table public.incidents;

-- Stuurt een noodmelding door naar beheer als 'incident_webhook_url' is ingesteld (zelfde
-- patroon als 'push_url'/'push_secret' bij pushmeldingen). Zonder secret doet dit niets: de
-- melding staat dan alleen in de tabel incidents en in de feed (pushmelding naar het spel
-- zelf loopt al via de bestaande events_push-trigger). 'text' en 'content' zijn allebei
-- gezet zodat dit zonder verdere aanpassing werkt met een gratis Slack- of Discord-
-- "incoming webhook" — zie README voor hoe dit in te stellen, geen nieuwe (betaalde) dienst
-- zonder akkoord van Erik.
create function private.notify_incident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_game    public.games;
  v_team    public.teams;
  v_message text;
begin
  select value into v_url from private.app_secrets where key = 'incident_webhook_url';
  if v_url is null then
    return new;
  end if;
  select * into v_game from public.games where id = new.game_id;
  select * into v_team from public.teams where id = new.team_id;
  v_message := format(
    '🆘 Noodmelding in Boevenjacht-spel %s (team %s). 112 gebeld: %s. %s',
    v_game.join_code, coalesce(v_team.name, 'onbekend'),
    case when new.called_112 then 'ja' else 'nee, nog niet aangegeven' end,
    case when new.lat is not null then format('Locatie: https://maps.google.com/?q=%s,%s', new.lat, new.lng) else 'Geen locatie beschikbaar.' end
  );
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('text', v_message, 'content', v_message),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
end;
$$;

create trigger incidents_notify after insert on public.incidents
  for each row execute function private.notify_incident();
