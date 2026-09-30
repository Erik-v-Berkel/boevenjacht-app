-- Beheerscherm (COP-6, week 4): "Lijst spellen, eindtijd aanpassen, foto afkeuren, spel
-- stoppen. Klaar als: geen SQL meer nodig; alle acties gelogd." Vervangt de SQL-noodgreep
-- uit PLAN.md §5 ("Erik past ends_at/status aan in het dashboard") door auditbare RPC's.

-- ---------------------------------------------------------------------------
-- Staff herkennen: zowel spelers (anonieme sessie) als beheer (e-mail/wachtwoord, zie
-- src/lib/staffAuth.ts) zijn "authenticated". Supabase zet het is_anonymous-claim alleen bij
-- signInAnonymously(), dus expliciet false betekent een echt (staff-)account.
-- ---------------------------------------------------------------------------

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

revoke execute on function public.is_staff() from public, anon;
grant  execute on function public.is_staff() to authenticated;

-- Beheer mag alles lezen (spellen kiezen, foto's beoordelen); spelers blijven beperkt tot
-- hun eigen spel via de bestaande is_game_member-policies (permissive policies zijn OR'd).
create policy "staff leest alle spellen" on public.games
  for select to authenticated using (public.is_staff());
create policy "staff leest alle teams" on public.teams
  for select to authenticated using (public.is_staff());
create policy "staff leest alle spelers" on public.players
  for select to authenticated using (public.is_staff());
create policy "staff leest alle fotos" on public.photos
  for select to authenticated using (public.is_staff());
create policy "staff bekijkt alle fotos in opslag" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_staff());

-- ---------------------------------------------------------------------------
-- Auditlog: elke schrijfactie vanuit het beheerscherm komt hier te staan (nooit direct
-- table-access, zie 20260930000004_staff_bookings_read.sql).
-- ---------------------------------------------------------------------------

create table public.admin_actions (
  id          bigserial primary key,
  -- actor_email is de duurzame vastlegging (audit blijft leesbaar ook als het account later
  -- verdwijnt); actor_id mag daarom op delete leeg raken in plaats van de hele rij te blokkeren.
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text not null,
  game_id     uuid references public.games (id) on delete cascade,
  action      text not null check (action in ('end_time_changed', 'photo_rejected', 'game_stopped')),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index admin_actions_game_id_idx on public.admin_actions (game_id, created_at);

alter table public.admin_actions enable row level security;
create policy "staff leest admin_actions" on public.admin_actions
  for select to authenticated using (public.is_staff());

alter publication supabase_realtime add table public.admin_actions;

-- Overzicht voor de spellenlijst: 1 rij per spel met de tellingen die het scherm toont.
-- security_invoker: respecteert de RLS van de aanroeper (dus alleen bruikbaar voor staff,
-- op dezelfde manier als de onderliggende tabellen).
create view public.admin_game_summary
with (security_invoker = true)
as
select
  g.id, g.join_code, g.status, g.started_at, g.police_start_at, g.ends_at, g.ended_at,
  g.winner, g.winning_team_id, g.bonus_total_min, g.created_at,
  (select count(*) from public.players p where p.game_id = g.id) as player_count,
  (select count(*) from public.photos ph where ph.game_id = g.id and ph.status = 'accepted') as accepted_photo_count,
  (select count(*) from public.photos ph where ph.game_id = g.id and ph.status = 'rejected') as rejected_photo_count
from public.games g;

grant select on public.admin_game_summary to authenticated;

-- ---------------------------------------------------------------------------
-- Eindtijd aanpassen
-- ---------------------------------------------------------------------------

create function public.admin_set_ends_at(p_game_id uuid, p_ends_at timestamptz, p_reason text default null)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_old  timestamptz;
begin
  if not public.is_staff() then
    raise exception 'Alleen beheer mag dit doen';
  end if;
  if p_ends_at is null then
    raise exception 'Geef een eindtijd op';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Spel niet gevonden';
  end if;
  if v_game.status not in ('headstart', 'running') then
    raise exception 'De eindtijd is alleen aan te passen tijdens de voorsprong of de zoektijd';
  end if;

  v_old := v_game.ends_at;
  update public.games set ends_at = p_ends_at where id = p_game_id returning * into v_game;

  insert into public.admin_actions (actor_id, actor_email, game_id, action, payload)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), p_game_id, 'end_time_changed',
          jsonb_build_object('old_ends_at', v_old, 'new_ends_at', p_ends_at, 'reason', p_reason));

  insert into public.events (game_id, type, payload)
  values (p_game_id, 'admin_action', jsonb_build_object('action', 'end_time_changed', 'reason', p_reason));

  v_game := private.sync_game(v_game);
  return v_game;
end;
$$;

-- ---------------------------------------------------------------------------
-- Foto afkeuren: alleen bonus-/controlepostfoto's (geen vangstfoto's, want dat zou het
-- eindigen van het spel moeten terugdraaien — dat is bewust geen onderdeel van COP-6).
-- ---------------------------------------------------------------------------

create function public.admin_reject_photo(p_photo_id uuid, p_reason text default null)
returns public.photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo  public.photos;
  v_game   public.games;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Afgekeurd door beheer');
  v_bonus  int;
begin
  if not public.is_staff() then
    raise exception 'Alleen beheer mag dit doen';
  end if;

  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found then
    raise exception 'Foto niet gevonden';
  end if;
  if v_photo.status = 'rejected' then
    raise exception 'Deze foto is al afgekeurd';
  end if;
  if v_photo.type = 'capture' then
    raise exception 'Een vangstfoto kan hier niet afgekeurd worden';
  end if;

  select * into v_game from public.games where id = v_photo.game_id for update;

  update public.photos set status = 'rejected', reject_reason = v_reason where id = p_photo_id
  returning * into v_photo;

  v_bonus := v_photo.bonus_min;
  if v_bonus > 0 then
    update public.games
       set bonus_total_min = greatest(0, bonus_total_min - v_bonus),
           ends_at = private.compute_ends_at(started_at, settings, greatest(0, bonus_total_min - v_bonus))
     where id = v_game.id
    returning * into v_game;
  end if;

  insert into public.admin_actions (actor_id, actor_email, game_id, action, payload)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), v_game.id, 'photo_rejected',
          jsonb_build_object('photo_id', p_photo_id, 'photo_type', v_photo.type, 'bonus_min', v_bonus, 'reason', v_reason));

  insert into public.events (game_id, type, payload)
  values (v_game.id, 'admin_action',
          jsonb_build_object('action', 'photo_rejected', 'photo_type', v_photo.type, 'bonus_min', v_bonus, 'reason', v_reason));

  perform private.sync_game(v_game);

  return v_photo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Spel stoppen: winner/winning_team_id blijven leeg, dat onderscheidt een handmatige
-- stop van een echte afloop (tijd op -> 'thieves', vangst -> 'police').
-- ---------------------------------------------------------------------------

create function public.admin_stop_game(p_game_id uuid, p_reason text default null)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
begin
  if not public.is_staff() then
    raise exception 'Alleen beheer mag dit doen';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Spel niet gevonden';
  end if;
  if v_game.status = 'ended' then
    raise exception 'Dit spel is al voorbij';
  end if;

  update public.games
     set status = 'ended', winner = null, winning_team_id = null, ended_at = now()
   where id = p_game_id
  returning * into v_game;

  insert into public.admin_actions (actor_id, actor_email, game_id, action, payload)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), p_game_id, 'game_stopped', jsonb_build_object('reason', p_reason));

  insert into public.events (game_id, type, payload)
  values (p_game_id, 'game_ended', jsonb_build_object('winner', null, 'reason', 'admin_stopped', 'admin_reason', p_reason));

  return v_game;
end;
$$;

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('game_started', 'police_released', 'bonus', 'bonus_cap_reached', 'capture', 'game_ended', 'ping',
                  'checkpoint', 'incident', 'admin_action'));

revoke execute on function public.admin_set_ends_at(uuid, timestamptz, text) from public, anon;
revoke execute on function public.admin_reject_photo(uuid, text)             from public, anon;
revoke execute on function public.admin_stop_game(uuid, text)                from public, anon;
grant  execute on function public.admin_set_ends_at(uuid, timestamptz, text) to authenticated;
grant  execute on function public.admin_reject_photo(uuid, text)             to authenticated;
grant  execute on function public.admin_stop_game(uuid, text)                to authenticated;
