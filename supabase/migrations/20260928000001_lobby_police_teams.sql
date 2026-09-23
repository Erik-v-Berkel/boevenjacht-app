-- Aantal Polizei-teams aanpassen in de lobby (1–5), zolang het spel niet gestart is.
-- Een team verwijderen kan alleen als er niemand in zit.

create function public.set_police_teams(p_game_id uuid, p_count int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game    public.games;
  v_current int;
  v_blocked text;
  v_colors  constant text[] := array['#2563eb', '#059669', '#9333ea', '#0891b2', '#db2777'];
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
  if p_count is null or p_count not between 1 and 5 then
    raise exception 'Kies 1 tot 5 Polizei-teams';
  end if;

  select count(*) into v_current from public.teams where game_id = p_game_id and role = 'police';

  if p_count < v_current then
    select string_agg(t.name, ', ' order by t.sort) into v_blocked
      from public.teams t
     where t.game_id = p_game_id and t.role = 'police'
       and t.sort > p_count
       and exists (select 1 from public.players p where p.team_id = t.id);
    if v_blocked is not null then
      raise exception 'Er zitten nog spelers in: %', v_blocked;
    end if;
    delete from public.teams where game_id = p_game_id and role = 'police' and sort > p_count;
  elsif p_count > v_current then
    insert into public.teams (game_id, role, name, color, sort)
    select p_game_id, 'police', 'Polizei ' || chr(64 + i), v_colors[i], i
      from generate_series(v_current + 1, p_count) as i;
  end if;

  -- Ook een wijziging in games, zodat alle telefoons herladen (Realtime levert deletes niet met een filter).
  update public.games
     set settings = settings || jsonb_build_object('police_teams', p_count)
   where id = p_game_id;
end;
$$;

revoke execute on function public.set_police_teams(uuid, int) from public, anon;
grant  execute on function public.set_police_teams(uuid, int) to authenticated;
