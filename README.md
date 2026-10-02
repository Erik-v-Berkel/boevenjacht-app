# Boevenjacht Düsseldorf

PWA voor verstoppertje in de binnenstad van Düsseldorf: 1 boeventeam en 1–5 Polizei-teams (standaard 3). Specificatie: [PLAN.md](PLAN.md).

React + TypeScript + Vite + Tailwind · Supabase (Postgres/PostGIS, Realtime, Storage) · Leaflet + Turf.js · gehost op Vercel.

Alle spelregels en de klok zitten in Postgres (RPC's met een row lock op het spel). De app rekent alleen voor directe feedback.

## Productie klaarzetten (eenmalig)

### 1. Supabase

1. **SQL Editor**: plak **elk bestand** uit `supabase/migrations/` **in bestandsnaam-volgorde** en voer ze één voor één uit (elk bestand precies één keer). Dit is de volledige lijst op dit moment — bij twijfel: sorteer de map op naam en loop ze van boven naar beneden af, mis je er één dan krijg je een "relation ... does not exist"-fout verderop:
   1. `20260922000001_games_teams_players.sql`
   2. `20260923000001_clock_engine.sql`
   3. `20260924000001_bonus_photos.sql`
   4. `20260925000001_capture.sql`
   5. `20260926000001_team_locations.sql`
   6. `20260927000001_extras.sql` (pings, radar, emoji- en tekstreacties, replay, pushmeldingen, 1–5 Polizei-teams)
   7. `20260928000001_lobby_police_teams.sql`
   8. `20260929000001_checkpoints.sql`
   9. `20260930000001_sight_coordinates.sql`
   10. `20260930000002_stadspakketten.sql` (stadspakket-schema: `cities`, `city_forbidden_zones`, `city_points_of_interest`)
   11. `20260930000003_products_and_bookings.sql`
   12. `20260930000004_staff_bookings_read.sql`
   13. `20260930000005_safety.sql`
   14. `20260930000006_city_driven_game.sql`
   15. `20260930000007_admin_panel.sql`
   16. `20261001000001_utrecht_city.sql`
   17. `20261001000002_utrecht_points_of_interest.sql`
   18. `20261001000003_utrecht_forbidden_zones.sql`
2. **Authentication → Sign In / Providers**: zet **Allow anonymous sign-ins** aan.
3. **Beheerderscode** voor "Nieuw spel" (kies zelf een code):

   ```sql
   insert into private.app_secrets (key, value)
   values ('admin_code', extensions.crypt('KIES-EEN-CODE', extensions.gen_salt('bf')))
   on conflict (key) do update set value = excluded.value;
   ```

### 2. Vercel

Add New → Project → importeer de GitHub-repo (framework Vite wordt herkend). Environment variables:

- `VITE_SUPABASE_URL` — Supabase → Project Settings → API
- `VITE_SUPABASE_ANON_KEY` — de anon key of de publishable key
- `VITE_VAPID_PUBLIC_KEY` — voor pushmeldingen (zie 3). Zonder deze variabele verbergt de app de knop "Meldingen aanzetten".

Elke push naar `main` deployt automatisch. Na het wijzigen van een variabele: **Redeploy** (Vite bakt ze in bij het bouwen).

### 3. Pushmeldingen (optioneel)

Meldingen als de telefoon op zak zit: foto's, pings, radar en de vangst. Op de iPhone alleen als de app op het beginscherm staat.

1. Sleutels maken (eenmalig, bewaar de uitvoer):

   ```sh
   npx web-push generate-vapid-keys
   ```

2. Kies zelf een lang willekeurig geheim, bijvoorbeeld de uitvoer van `node -e "console.log(crypto.randomUUID())"`.
3. Edge Function uitrollen (`<ref>` = project-ref uit de Supabase-URL):

   ```sh
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase secrets set VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> VAPID_SUBJECT=mailto:<jouw e-mail> PUSH_SECRET=<geheim>
   npx supabase functions deploy push --no-verify-jwt
   ```

4. **SQL Editor** — de database laten weten waar de functie staat:

   ```sql
   insert into private.app_secrets (key, value) values
     ('push_url', 'https://<ref>.supabase.co/functions/v1/push'),
     ('push_secret', '<geheim>')
   on conflict (key) do update set value = excluded.value;
   ```

5. **Vercel**: `VITE_VAPID_PUBLIC_KEY=<public key>` toevoegen en redeployen.

Werkt het niet? Supabase → Edge Functions → push → Logs, en in SQL: `select status_code, content from net._http_response order by id desc limit 5;`.

### Noodmeldingen naar beheer (optioneel, COP-7)

De noodknop in de app (112 bellen + "Meld dit bij Boevenjacht") legt elke melding altijd vast in de tabel `incidents` en in de feed van het spel. Wil je daarnaast direct een bericht op je telefoon (bv. via een gratis Slack- of Discord-"incoming webhook"), zet dan het webhook-adres klaar — zelfde patroon als bij pushmeldingen hierboven, zonder dit blijft het bij loggen:

```sql
insert into private.app_secrets (key, value) values
  ('incident_webhook_url', 'https://hooks.slack.com/services/…')
on conflict (key) do update set value = excluded.value;
```

## Spel spelen

1. **De dag ervoor**: open de app, onderaan **Nieuw spel aanmaken**, vul de beheerderscode in. Deel de link in de groepsapp.
2. Iedereen opent de link, zet de app op het beginscherm, vult een naam in en kiest een team (max. 3).
3. Als alle teams iemand hebben: **Start spel** 3 seconden ingedrukt houden.

## Testen

- **Testspel**: vink bij Nieuw spel "Testspel" aan. De tijd loopt dan 12× zo snel (hele spel ±16 min). Bonusminuten tellen gewoon als 10/15.
- **Nep-GPS**: in een testspel op de Regels-tab **🛠️ Nep-GPS** aanzetten (werkt ook in de app op het beginscherm), of `?dev=1` achter de URL zetten (bv. `https://…/j/<code>?dev=1` of `https://…/spel/<id>?dev=1`); het blijft aan als je verder klikt. Op het camerascherm kies je een locatie uit een lijst, op de kaart tik je een punt aan.
- **Automatische tests**:

  ```bash
  npm install
  npm run db:start      # lokale Supabase in Docker (Docker Desktop moet draaien)
  npm test              # unit-tests + alle spelregels tegen de lokale database
  npm run dev           # in een tweede terminal, daarna:
  npm run test:e2e      # heel spel in de browser met 5 nep-telefoons (Edge), screenshots in test-results/
  npm run test:capacity # 6 spellen x 18 spelers tegelijk tegen de RPC's, nep-GPS + snelle klok (±90 s)
  ```

  Na een wijziging in `supabase/migrations/`: `npm run db:reset` (lokale beheerderscode is dan `test-admin`, zie `supabase/seed.sql`).

## Lokaal ontwikkelen

```bash
npm run db:start
# .env.local met VITE_SUPABASE_URL=http://127.0.0.1:54321 en VITE_SUPABASE_ANON_KEY=<ANON_KEY uit `npx supabase status`>
npm run dev
```

## Bezienswaardigheden en spelgebied

De coördinaten staan in `supabase/migrations/20260924000001_bonus_photos.sql` (`private.sight_templates` en `private.default_play_area()`) en zijn **benaderingen**: controleer ze in Google Maps. Elk nieuw spel krijgt een kopie in de tabel `sights`. Aanpassen:

```sql
-- Voor alle nieuwe spellen (sjabloon)
update private.sight_templates set geometry = '{"type":"Point","coordinates":[6.7620,51.2180]}', radius_m = 90
where name = 'Rheinturm';

-- Alleen voor één bestaand spel
update sights set radius_m = 90 where game_id = '<game-id>' and name = 'Rheinturm';

-- Proefspel in je eigen stad: eigen bezienswaardigheden en spelgebied (GeoJSON: [lng, lat])
delete from sights where game_id = '<game-id>';
insert into sights (game_id, name, geometry, radius_m, sort) values
  ('<game-id>', 'Kerk', '{"type":"Point","coordinates":[5.1214,52.0907]}', 60, 1);
update games set settings = settings || jsonb_build_object('play_area',
  '{"type":"Polygon","coordinates":[[[5.10,52.08],[5.14,52.08],[5.14,52.10],[5.10,52.10],[5.10,52.08]]]}'::jsonb)
where id = '<game-id>';
```

Het spelgebied voor nieuwe spellen wijzig je door `private.default_play_area()` opnieuw aan te maken (`create or replace function …`).

## Noodingrepen (Supabase → SQL Editor)

Er is geen spelleider in de app. Als het echt misgaat:

```sql
-- Spel opzoeken
select id, join_code, status, ends_at, bonus_total_min, winner from games order by created_at desc;

-- Speler in een ander team zetten (ook na de start)
update players set team_id = (select id from teams where game_id = '<game-id>' and name = 'Polizei B')
where game_id = '<game-id>' and name = '<naam>';

-- Per ongeluk gestart: terug naar de lobby
update games set status = 'lobby', started_at = null, police_start_at = null, ends_at = null, ended_at = null
where id = '<game-id>';
delete from events where game_id = '<game-id>';

-- Klok bijstellen, bv. 10 minuten erbij
update games set ends_at = ends_at + interval '10 minutes' where id = '<game-id>';

-- Spel dat op 'ended' staat weer laten lopen (eerst ends_at in de toekomst zetten)
update games set status = 'running', winner = null, winning_team_id = null, ended_at = null where id = '<game-id>';
delete from events where game_id = '<game-id>' and type in ('game_ended', 'capture');
-- en bij een onterechte vangst ook:
update photos set status = 'rejected', reject_reason = 'Afgekeurd door Erik' where id = '<vangstfoto-id>';

-- Bonusfoto alsnog afwijzen en de aftrek opnieuw berekenen
update photos set status = 'rejected', reject_reason = 'Afgekeurd door Erik' where id = '<photo-id>';
delete from events where type = 'bonus' and payload->>'photo_id' = '<photo-id>';
update games g set
  bonus_total_min = s.total,
  ends_at = g.started_at + ((g.settings->>'headstart_min')::numeric + (g.settings->>'search_min')::numeric
            - least(s.total, (g.settings->>'max_bonus_total_min')::int))
            * interval '1 minute' / (g.settings->>'time_scale')::numeric
from (select coalesce(sum(bonus_min), 0)::int as total from photos
      where game_id = '<game-id>' and status = 'accepted') s
where g.id = '<game-id>';
```

## Na het weekend: opruimen

1. Download de foto's via het eindscherm: **Download alle foto's (zip)**.
2. Foto's verwijderen: Supabase → **Storage** → bucket `photos` → map `<game-id>` → selecteren → Delete. (Rechtstreeks uit `storage.objects` verwijderen via SQL blokkeert Supabase.)
3. Spel verwijderen (teams, spelers, foto-registraties en events gaan mee):

   ```sql
   delete from games where id = '<game-id>';
   ```

4. Eventueel de anonieme gebruikers: Authentication → Users → filter "Anonymous" → verwijderen.

## Stadspakket-boeking en staff-login (COP-52)

Naast het spel zelf staan er twee losse funnels in dezelfde app, die niet op de anonieme
spelers-sessie hierboven wachten:

- **`/boeken`** — checkout-wizard voor stadspakketten (stad → pakket → gegevens → bevestigd).
  Data komt uit `cities`/`products`/`bookings` (migraties `20260930000002`–`20260930000004`);
  prijsberekening incl. lanceeraanbod gebeurt server-side in `submit_booking()`.
- **`/staff`** — inlogscherm voor staff (Supabase Auth, e-mail/wachtwoord). Geen
  zelfregistratie: accounts worden buiten de app om aangemaakt (Supabase-dashboard →
  Authentication → Add user). Elke ingelogde gebruiker is staff en ziet na inloggen meteen
  het beheerscherm.

### Beheerscherm (COP-6)

Na inloggen op `/staff` zie je de lijst van alle spellen (spelersaantal, geaccepteerde/
afgekeurde foto's, eindtijd). Klik een spel aan voor:

- **Eindtijd aanpassen** — alleen tijdens de voorsprong/zoektijd.
- **Foto afkeuren** — alleen bonusfoto's (bier/bezienswaardigheid), geen vangstfoto's; een
  toegekende bonus wordt teruggedraaid en de eindtijd schuift weer op.
- **Spel stoppen** — eindigt het spel direct zonder winnaar (met bevestigingsstap).

Alle drie gaan via auditbare RPC's (`admin_set_ends_at`, `admin_reject_photo`,
`admin_stop_game`); geen SQL meer nodig. Elke actie komt in `admin_actions` te staan (wie,
wat, wanneer, reden) en spelers zien 'm ook terug in hun eigen feed.

## Privacy

Foto's staan in een privé Storage-bucket; alleen deelnemers van het spel kunnen ze zien (getekende URL's). De Polizei ziet nooit live locaties van de boeven: die staan in een aparte tabel die alleen boeven onderling kunnen lezen. Pings tonen alleen een verschoven cirkel. De routes van iedereen (voor de replay) zijn pas na afloop zichtbaar.
