-- COP-74: in-app feedbackformulier na afloop van een spel. Gekozen in plaats van een los
-- Google Form/Typeform zodat het zonder nieuw account/dienst werkt (regel: geen nieuwe
-- betaalde dienst zonder akkoord van Erik) en Erik de antwoorden gewoon in Supabase ziet
-- staan, naast de rest van de speldata.
--
-- Vier vragen uit de issue: leuk gevonden (1-5), saaiste moment, wie won en hoe, wat brak er
-- in de app. Alles optioneel behalve het cijfer, zodat spelers 'm niet overslaan vanwege één
-- lege tekstvraag.

create table public.feedback (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games (id) on delete cascade,
  player_id      uuid not null references public.players (id) on delete cascade,
  enjoyed        int not null check (enjoyed between 1 and 5),
  boring_moment  text,
  winner_comment text,
  bug_report     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (game_id, player_id)
);
create index feedback_game_id_idx on public.feedback (game_id);

-- Geen publieke policies: spelers schrijven alleen via submit_feedback (security definer),
-- lezen gebeurt door Erik/staff (public.is_staff(), zie 20260930000007_admin_panel.sql).
alter table public.feedback enable row level security;
create policy "staff leest alle feedback" on public.feedback
  for select to authenticated using (public.is_staff());

create function public.submit_feedback(
  p_game_id        uuid,
  p_enjoyed        int,
  p_boring_moment  text default null,
  p_winner_comment text default null,
  p_bug_report     text default null
)
returns public.feedback
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player   public.players;
  v_feedback public.feedback;
begin
  select * into v_player from public.players where game_id = p_game_id and user_id = auth.uid();
  if not found then
    raise exception 'Je doet niet mee aan dit spel';
  end if;
  if p_enjoyed is null or p_enjoyed not between 1 and 5 then
    raise exception 'Geef een cijfer van 1 tot 5';
  end if;

  insert into public.feedback (game_id, player_id, enjoyed, boring_moment, winner_comment, bug_report)
  values (p_game_id, v_player.id, p_enjoyed,
          nullif(btrim(coalesce(p_boring_moment, '')), ''),
          nullif(btrim(coalesce(p_winner_comment, '')), ''),
          nullif(btrim(coalesce(p_bug_report, '')), ''))
  -- Opnieuw invullen (bv. na een typo) overschrijft het vorige antwoord i.p.v. een dubbele rij.
  on conflict (game_id, player_id) do update
    set enjoyed = excluded.enjoyed, boring_moment = excluded.boring_moment,
        winner_comment = excluded.winner_comment, bug_report = excluded.bug_report,
        updated_at = now()
  returning * into v_feedback;

  return v_feedback;
end;
$$;

revoke execute on function public.submit_feedback(uuid, int, text, text, text) from public, anon;
grant  execute on function public.submit_feedback(uuid, int, text, text, text) to authenticated;
