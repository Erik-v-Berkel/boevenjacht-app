-- COP-62: fix "relation city_points_of_interest does not exist" bij create_game(p_city_slug).
--
-- Erik kreeg deze foutmelding bij het starten van een testspel met stad Utrecht, hoewel de
-- tabel wel degelijk bestond (hij deelde de information_schema-lijst ter controle). Oorzaak:
-- private.copy_sights_from_city (20260930000006_city_driven_game.sql) leest ongekwalificeerd
-- van `city_points_of_interest` i.p.v. `public.city_points_of_interest`. Die functie wordt
-- aangeroepen vanuit create_game, dat `set search_path = ''` heeft (bewust, voor
-- SECURITY DEFINER-veiligheid) - de ongekwalificeerde naam kan dan niet worden opgelost, ook al
-- bestaat de tabel gewoon. Dit bleef verborgen zolang er nog geen stad met p_city_slug een
-- echt spel startte (Düsseldorf gebruikt nog altijd private.copy_sights, niet dit pad).
--
-- Fix: schema-prefix toevoegen, zoals de rest van dezelfde functie/migratie al doet
-- (vgl. "insert into public.sights" op de regel erboven).

create or replace function private.copy_sights_from_city(p_game_id uuid, p_city_id uuid)
returns void
language sql
as $$
  insert into public.sights (game_id, name, geometry, radius_m, sort)
  select p_game_id,
         coalesce(name_nl, name_en, 'Bezienswaardigheid'),
         extensions.st_asgeojson(location)::jsonb,
         radius_m,
         sort_order
    from public.city_points_of_interest
   where city_id = p_city_id
     and kind = 'bezienswaardigheid'
   order by sort_order
$$;
