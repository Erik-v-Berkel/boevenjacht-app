-- Mollie-checkout en webhook-afhandeling (COP-5): submit_booking() (20260930000003) levert een
-- 'pending' boeking op; hier komt het vervolg bij. Postgres kan zelf geen HTTPS-aanroepen naar
-- Mollie doen zonder de API-key in de database te zetten (pg_net) — dat is een secret en hoort
-- thuis in een Edge Function-omgevingsvariabele (AGENTS.md regel 8). Daarom doen twee Edge
-- Functions (supabase/functions/mollie-create-payment, mollie-webhook) de aanroepen naar Mollie,
-- en roepen zij de RPC's hieronder aan met de service-role-key — dezelfde knip als bij de
-- pushmeldingen-functie (supabase/functions/push).

alter table bookings
  add column if not exists mollie_payment_id text unique,
  add column if not exists mollie_status text,
  add column if not exists paid_at timestamptz,
  add column if not exists game_id uuid references games (id),
  add column if not exists join_code text;

comment on column bookings.mollie_status is
  'Ruwe Mollie-paymentstatus (paid/expired/canceled/failed/open/…) voor diagnose. bookings.status '
  'blijft het simpele pending/confirmed/cancelled dat de staff-UI al kent.';

-- ---------------------------------------------------------------------------
-- create_game() opgesplitst: het teams/sights-gedeelte verhuist naar create_game_core(), zonder
-- de staff-auth- en beheerderscode-check. fulfil_booking_payment() hieronder heeft geen van
-- beide (de webhook heeft geen ingelogde staff-sessie), maar moet wel hetzelfde spel kunnen
-- opzetten als de handmatige "Nieuw spel"-knop. Gedrag van create_game() zelf verandert niet.
-- ---------------------------------------------------------------------------

create or replace function private.create_game_core(p_settings jsonb, p_city_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_teams    int;
  v_city_id  uuid;
  v_red_line extensions.geography;
  v_code     text;
  v_game_id  uuid;
  v_letters  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_colors   constant text[] := array['#2563eb', '#059669', '#9333ea', '#0891b2', '#db2777'];
begin
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

-- Dunne laag: staff-auth + beheerderscode-check, dan create_game_core(). Signatuur en gedrag
-- ongewijzigd t.o.v. 20260930000006_city_driven_game.sql.
create or replace function public.create_game(
  p_admin_code text,
  p_settings jsonb default '{}'::jsonb,
  p_city_slug text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select value into v_hash from private.app_secrets where key = 'admin_code';
  if v_hash is null or extensions.crypt(coalesce(p_admin_code, ''), v_hash) <> v_hash then
    raise exception 'Onjuiste beheerderscode';
  end if;

  return private.create_game_core(p_settings, p_city_slug);
end;
$$;

revoke execute on function public.create_game(text, jsonb, text) from public, anon;
grant  execute on function public.create_game(text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Betaling afronden
-- ---------------------------------------------------------------------------

-- Hoeveel Polizei-teams een boeking krijgt: zoveel teams van max. 3 spelers als nodig, min het
-- boeventeam, geclamped op 1-5 (dezelfde grenzen als de handmatige "Nieuw spel"-UI, zie
-- src/pages/NewGame.tsx). Vuistregel, geen vastgelegde spelregel — bij de afsluiting van COP-5
-- staat dit als open vraag aan Erik of de verdeling bevalt.
create or replace function private.police_teams_for(p_participant_count int)
returns int
language sql
immutable
as $$
  select greatest(1, least(5, ceil(p_participant_count::numeric / 3) - 1))::int
$$;

-- Aangeroepen door supabase/functions/mollie-webhook met de service-role-key, nadat de Edge
-- Function de betaalstatus rechtstreeks bij Mollie heeft opgehaald (nooit op de inhoud van de
-- webhook-melding zelf vertrouwen, zie Mollie-documentatie "Verifying webhook calls"). Idempotent:
-- Mollie kan dezelfde melding meerdere keren sturen; een boeking wordt maar één keer bevestigd en
-- krijgt maar één spel.
create or replace function public.fulfil_booking_payment(
  p_booking_id uuid,
  p_mollie_payment_id text,
  p_mollie_status text
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings%rowtype;
  v_city    cities%rowtype;
  v_game    jsonb;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'onbekende boeking: %', p_booking_id;
  end if;

  -- Al afgehandeld (dubbele webhook-melding): ongewijzigd teruggeven, geen tweede spel aanmaken.
  if v_booking.status <> 'pending' then
    return v_booking;
  end if;

  if p_mollie_status = 'paid' then
    select * into v_city from cities where id = v_booking.city_id;

    v_game := private.create_game_core(
      jsonb_build_object('police_teams', private.police_teams_for(v_booking.participant_count)),
      v_city.slug
    );

    update bookings set
      status = 'confirmed',
      mollie_payment_id = p_mollie_payment_id,
      mollie_status = p_mollie_status,
      paid_at = now(),
      game_id = (v_game ->> 'game_id')::uuid,
      join_code = v_game ->> 'join_code'
    where id = p_booking_id
    returning * into v_booking;
  else
    update bookings set
      status = 'cancelled',
      mollie_payment_id = p_mollie_payment_id,
      mollie_status = p_mollie_status
    where id = p_booking_id
    returning * into v_booking;
  end if;

  return v_booking;
end;
$$;

revoke execute on function public.fulfil_booking_payment(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.fulfil_booking_payment(uuid, text, text) to service_role;

-- Publiek, minimale status-check voor de "bedankt"-pagina na terugkomst van Mollie: alleen status
-- + spelcode, geen naam/e-mail (die blijven achter de bestaande RLS, net als de rest van bookings).
create or replace function public.get_booking_status(p_booking_id uuid)
returns table (status text, join_code text)
language sql
security definer
set search_path = public
stable
as $$
  select status, join_code from bookings where id = p_booking_id
$$;

revoke execute on function public.get_booking_status(uuid) from public;
grant  execute on function public.get_booking_status(uuid) to anon, authenticated;
