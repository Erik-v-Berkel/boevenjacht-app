# Boevenjacht Düsseldorf

PWA voor verstoppertje in de binnenstad van Düsseldorf: 1 boeventeam, 3 politieteams. Specificatie: [PLAN.md](PLAN.md).

React + TypeScript + Vite + Tailwind · Supabase (Postgres, Realtime, Storage) · gehost op Vercel.

## Lokaal ontwikkelen

```bash
npm install
npm run db:start          # lokale Supabase in Docker (Docker Desktop moet draaien)
cp .env.example .env.local  # vul URL + anon key in (lokaal: zie `npx supabase status`)
npm run dev
```

## Tests

```bash
npm run test:unit   # pure TypeScript
npm run test:db     # spelregels in Postgres, tegen de lokale Supabase (npm run db:start)
npm test            # allebei
```

Na een wijziging in `supabase/migrations/`: `npm run db:reset` (past alle migraties en `supabase/seed.sql` opnieuw toe; lokale beheerderscode is `test-admin`).

## Productie-database (Supabase-dashboard)

1. **SQL Editor**: plak elk bestand uit `supabase/migrations/` in volgorde (op bestandsnaam) en voer het uit. Elk bestand maar één keer.
2. **Authentication → Sign In / Providers**: zet **Allow anonymous sign-ins** aan.
3. **Beheerderscode** instellen (nodig voor "Nieuw spel"); kies zelf een code:

   ```sql
   insert into private.app_secrets (key, value)
   values ('admin_code', extensions.crypt('KIES-EEN-CODE', extensions.gen_salt('bf')))
   on conflict (key) do update set value = excluded.value;
   ```

## Deploy (Vercel)

Vercel → Add New → Project → importeer de GitHub-repo. Framework: Vite (automatisch). Environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (anon key of publishable key)

Elke push naar `main` deployt automatisch.

## Noodingrepen (SQL Editor)

```sql
-- Spel opzoeken
select id, join_code, status, ends_at from games order by created_at desc;

-- Speler uit een team halen (lobby)
update players set team_id = null where game_id = '<game-id>' and name = '<naam>';

-- Per ongeluk gestart: terug naar de lobby
update games set status = 'lobby', started_at = null, police_start_at = null, ends_at = null
where id = '<game-id>';
delete from events where game_id = '<game-id>';

-- Klok bijstellen, bv. 10 minuten erbij
update games set ends_at = ends_at + interval '10 minutes' where id = '<game-id>';

-- Spel dat al 'ended' staat weer laten lopen (na het bijstellen van ends_at)
update games set status = 'running', winner = null where id = '<game-id>';
delete from events where game_id = '<game-id>' and type = 'game_ended';
```

```sql
-- Foto alsnog afwijzen (aftrek terugdraaien: bonus_total_min en ends_at opnieuw berekenen)
update photos set status = 'rejected', reject_reason = 'Afgekeurd door Erik' where id = '<photo-id>';
update games g set
  bonus_total_min = (select coalesce(sum(bonus_min), 0) from photos where game_id = g.id and status = 'accepted'),
  ends_at = started_at + ((settings->>'headstart_min')::numeric + (settings->>'search_min')::numeric
            - least((select coalesce(sum(bonus_min), 0) from photos where game_id = g.id and status = 'accepted'),
                    (settings->>'max_bonus_total_min')::int))
            * interval '1 minute' / (settings->>'time_scale')::numeric
where id = '<game-id>';
delete from events where type = 'bonus' and payload->>'photo_id' = '<photo-id>';
```

## Bezienswaardigheden en spelgebied

De coördinaten staan in `supabase/migrations/20260924000001_bonus_photos.sql` (`private.sight_templates` en `private.default_play_area()`) en zijn **benaderingen**: controleer ze in Google Maps. Elk nieuw spel krijgt een kopie in de tabel `sights`; aanpassen voor één spel:

```sql
-- Straal of positie van één bezienswaardigheid in één spel
update sights set radius_m = 90 where game_id = '<game-id>' and name = 'Rheinturm';
update sights set geometry = '{"type":"Point","coordinates":[6.7620,51.2180]}' where game_id = '<game-id>' and name = 'Rheinturm';

-- Proefspel in je eigen stad: eigen bezienswaardigheden en spelgebied (GeoJSON: [lng, lat])
delete from sights where game_id = '<game-id>';
insert into sights (game_id, name, geometry, radius_m, sort) values
  ('<game-id>', 'Kerk', '{"type":"Point","coordinates":[5.1214,52.0907]}', 60, 1);
update games set settings = settings || jsonb_build_object('play_area',
  '{"type":"Polygon","coordinates":[[[5.10,52.08],[5.14,52.08],[5.14,52.10],[5.10,52.10],[5.10,52.08]]]}'::jsonb)
where id = '<game-id>';
```

## Testen met nep-GPS

In een testspel (vinkje "Testspel" bij Nieuw spel) zet je `?dev=1` achter de URL, bv. `https://…/spel/<id>?dev=1`. Op het camerascherm verschijnt dan een keuzelijst om je locatie te "verplaatsen" naar een bezienswaardigheid, kroeg of buiten het speelveld.
