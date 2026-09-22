# Boevenjacht Düsseldorf — bouwplan

> Specificatie voor een mobiele web-app (PWA) waarin 1 boeventeam en 3 politieteams verstoppertje spelen in de binnenstad van Düsseldorf. Dit document is bedoeld als input voor Claude Code: lees het helemaal en bouw daarna fase voor fase (zie §9).

---

## 1. Samenvatting

- **Vorm:** Progressive Web App (PWA). Openen via een link in Safari/Chrome en daarna "Zet op beginscherm". Geen App Store nodig.
- **Spelers:** 12 personen, 4 teams van 3. Eén boeventeam en drie politieteams (Politie A, B en C). Iedere speler heeft een eigen telefoon.
- **Speelduur:** de boeven krijgen 15 minuten voorsprong, daarna zoekt de politie 3 uur. Totaal 3 uur en 15 minuten.
- **Kern:** de boeven verdienen tijdaftrek met foto's: bier in een kroeg −10 min, bezienswaardigheid −15 min. Maximaal 120 minuten in totaal. Elke foto toont wel direct hun GPS-locatie aan de politie. Risico tegen beloning.
- **Boeven blijven samen:** het boeventeam wordt in één keer gevangen, met één vangstfoto.
- **Winst:** de politie wint als de boeven gevangen worden voordat de klok op 0 staat. Het politieteam dat de vangst doet, is de winnaar. Staat de klok op 0, dan winnen de boeven.
- **Geen spelleider:** alles gaat automatisch. De app controleert zelf GPS, wachttijd en dubbele foto's. Er zijn geen admin-schermen.
- **Planning:** het weekend is over minder dan 2 weken. De accounts voor Supabase, Vercel en GitHub zijn er al.

---

## 2. Spelregels (zoals de app ze afdwingt)

### 2.1 Tijdlijn
| Moment | Wat gebeurt er |
|---|---|
| `T0` | Een speler houdt de knop **Start spel** in de lobby ingedrukt. De boeven vertrekken. De politie ziet een aftelklok: "Jullie mogen over 15:00 vertrekken". |
| `T0 + 15 min` | De politie mag vertrekken. De zoekklok start op **3:00:00**. |
| Tijdens het spel | Elke geldige boevenfoto haalt direct tijd van de zoekklok af, tot maximaal 120 minuten. |
| Klok = 0 | Het spel is voorbij en de boeven winnen. |
| Vangstfoto | Het spel is voorbij en de politie wint. Het team met de vangstfoto is de winnaar. |

**Formule (server-side, de enige waarheid):**
```
totale_aftrek = min(som(bonus_min van geaccepteerde foto's), max_bonus_total_min)   -- max = 120
eindtijd      = T0 + headstart_min (15) + search_min (180) − totale_aftrek
```
Alle waarden staan in `games.settings`. Ze worden vastgelegd bij het aanmaken van het spel en daarna niet meer aangepast.

### 2.2 Bonusfoto's van de boeven
| Type | Aftrek | Voorwaarden |
|---|---|---|
| 🍺 Bier in een kroeg | −10 min | Bier zichtbaar op de foto. De boef typt de naam van de kroeg (vrije invoer). **Elke kroeg telt 1×** (zie §4). |
| 🏛️ Bezienswaardigheid | −15 min | De speler staat binnen de straal van een van de 10 bezienswaardigheden (§3). **Elke bezienswaardigheid telt 1×.** |

Algemeen:
- **Wachttijd:** minstens 10 minuten tussen twee bonusfoto's van het boeventeam. Dit geldt voor het hele team, niet per speler.
- **Plafond:** de totale aftrek is maximaal 120 minuten. Een foto die over het plafond heen gaat, wordt nog wel geplaatst en toont de GPS-pin, maar trekt alleen de resterende minuten af. Daarna geeft de app bij het maken van een foto de melding "Maximale aftrek bereikt, deze foto levert geen tijd meer op (maar verraadt wel je locatie!)".
- **Alleen de live camera:** foto's worden in de app gemaakt, niet uit de fotorol geüpload.
- **GPS verplicht:** bij elke foto gaan de locatie en de nauwkeurigheid mee. Zonder GPS geen bonus.
- **Direct zichtbaar:** elke foto verschijnt meteen in de feed en als pin op de kaart bij alle teams, met een melding als "Boeven: −15 min bij Burgplatz".
- Foto's tijdens de voorsprong tellen ook mee (`bonus_during_headstart: true`).

### 2.3 Vangen
- De boeven blijven **samen**. Het boeventeam wordt als geheel gevangen.
- Vangen gaat zo: een politiespeler maakt in de app een **vangstfoto** waarop de boeven herkenbaar staan en drukt op **"Boeven gevangen!"**.
- Dit gaat volledig automatisch: het spel eindigt direct. De vangstfoto komt groot in de feed en op het eindscherm.
- Alle boeven zien: "Jullie zijn gevangen door Politie B om 21:14."
- Alleen de eerste vangstfoto die de server bereikt, telt. Latere pogingen krijgen de melding "Te laat, Politie A was je voor."
- **"Samen blijven" controleren (optioneel, fase 7):** de boeven zien elkaar op hun eigen kaart. Staan ze meer dan 100 m uit elkaar, dan krijgen ze de melding "Blijf bij elkaar!". De politie ziet deze live locaties **niet**.

### 2.4 Spelgebied
- Het hele gebied van de weekendkaart: Altstadt, Carlstadt, Königsallee, Hofgarten, Rheinuferpromenade, Rheinturm en MedienHafen. Alle 10 bezienswaardigheden liggen daarbinnen.
- Het gebied wordt als GeoJSON-polygoon op de kaart getekend. Voorstel voor de grenzen: Rijn in het westen, Hofgarten/Kaiserstraße in het noorden, Königsallee/Berliner Allee in het oosten en MedienHafen/Rheinturm in het zuiden. Controleer dit in Google Maps.
- Ben je buiten het gebied, dan waarschuwt de app: "Je bent buiten het speelveld". Er volgt geen straf. Bonusfoto's buiten het gebied worden afgewezen.

---

## 3. Bezienswaardigheden (van de weekendkaart)

De coördinaten zijn **benaderingen**. Controleer en verfijn ze in Google Maps vóór het weekend. De straal geeft aan hoe dicht je erbij moet staan voor de bonus.

| # | Naam | Lat | Lng | Straal |
|---|---|---|---|---|
| 1 | Burgplatz & Schlossturm | 51.2277 | 6.7716 | 75 m |
| 2 | St. Lambertus Basilika | 51.2289 | 6.7729 | 60 m |
| 3 | Rathaus & Jan-Wellem-Denkmal | 51.2261 | 6.7721 | 60 m |
| 4 | Rheinuferpromenade | lijn langs de Rijn | — | 40 m van de lijn |
| 5 | Königsallee (Kö) | lijn over de gracht | — | 50 m van de lijn |
| 6 | Carlsplatz | 51.2226 | 6.7745 | 60 m |
| 7 | Hofgarten | polygoon van het park | — | binnen de polygoon |
| 8 | K20 Kunstsammlung NRW | 51.2276 | 6.7760 | 60 m |
| 9 | MedienHafen / Gehry-Bauten | 51.2155 | 6.7555 | 100 m |
| 10 | Rheinturm | 51.2179 | 6.7618 | 75 m |

**Implementatie:** sla elke bezienswaardigheid op als GeoJSON: een `Point` met straal, een `LineString` met buffer of een `Polygon`. Controleer met Turf.js op de client (voor directe feedback) en nog een keer op de server.

**GPS-tolerantie:** is `accuracy` groter dan de straal, dan toont de app "GPS nog niet nauwkeurig genoeg, even wachten…" en probeert het opnieuw.

Samen leveren de bezienswaardigheden 150 minuten op, maar het plafond ligt op 120. De boeven moeten dus kiezen.

## 4. Kroegen: vrije invoer

Er is geen vooraf ingevulde lijst. Bij een bierfoto typt de boef de naam van de kroeg.

De app voorkomt dat een kroeg twee keer telt:
1. **Naamcontrole:** de naam wordt genormaliseerd: kleine letters, accenten weg (ü→u, ß→ss), leestekens weg en losse woorden als "brauerei", "zum", "zur", "im", "bar", "kneipe" en "die/der/das" weg. Bestaat de genormaliseerde naam al, dan wordt de foto afgewezen.
2. **GPS-controle:** ligt de foto binnen 30 m van een eerdere bierfoto, dan wordt hij afgewezen met "Deze kroeg is al gebruikt (volgens je locatie)". GPS is binnen vaak onnauwkeurig, dus bij `accuracy` > 50 m wordt alleen de naamcontrole gebruikt.
3. **Autocomplete:** tijdens het typen toont de app de kroegen die al gebruikt zijn, zodat de boeven zelf zien wat niet meer kan.
4. De foto moet binnen het spelgebied gemaakt zijn.

---

## 5. Techniek

| Onderdeel | Keuze | Waarom |
|---|---|---|
| Frontend | **React + TypeScript + Vite**, Tailwind CSS | Snel, licht, goede PWA-ondersteuning |
| PWA | `vite-plugin-pwa` (manifest, service worker, icoon) | "Zet op beginscherm" op iPhone en Android |
| Backend | **Supabase** (Postgres, Storage, Realtime, RPC/Edge Functions) | Realtime feed, fotostorage en database in één; de gratis tier volstaat |
| Kaart | **Leaflet** + OpenStreetMap-tegels | Gratis, geen API-key nodig |
| Geo-controles | **Turf.js** | Afstand, punt-in-polygoon, buffer rond lijnen |
| Hosting | **Vercel** (GitHub-koppeling, automatisch deployen) | HTTPS is verplicht voor camera en GPS |
| Inloggen | Geen accounts: join-code + naam, anonieme Supabase-sessie | Zo min mogelijk drempel in de kroeg |

### Belangrijke technische eisen
- **De server is de klok.** De eindtijd wordt uit de database berekend. Clients rekenen de countdown uit als `eindtijd − (lokale tijd + serverOffset)`. De offset wordt bij het laden bepaald met een server-timestamp.
- **Alle validatie op de server**, in een Postgres-RPC `submit_photo`: spelstatus, wachttijd, dubbelingen, geofence en plafond. Controles op de client zijn alleen voor snelle feedback.
- **Race conditions:** alles in één transactie met `SELECT … FOR UPDATE` op de game-rij. Zo kloppen de wachttijd, dubbelingen, het plafond en "eerste vangst telt" ook als twee spelers tegelijk iets insturen.
- **Camera:** `getUserMedia` met de achtercamera, foto uit het videobeeld pakken (dus geen fotorol). Terugvaloptie: `<input type="file" accept="image/*" capture="environment">`.
- **Compressie:** foto's op de client verkleinen tot maximaal 1600 px, JPEG ~0,7 (±300 KB).
- **Slecht bereik:** een uploadwachtrij met nieuwe pogingen. Een bonus telt pas als de server de foto heeft ontvangen. Toon de status duidelijk: "Wordt verstuurd…" / "Verstuurd ✓ −10 min".
- **Spel starten zonder spelleider:** de startknop werkt pas als alle 4 teams minstens 1 speler hebben. Je moet hem 3 seconden ingedrukt houden (tegen per ongeluk drukken). De server accepteert alleen de eerste start.
- **Scherm aan:** Screen Wake Lock API op het hoofdscherm.
- **Meldingen:** een realtime melding in de app plus trillen bij nieuwe foto's. Web Push slaan we over (te weinig tijd, en op iOS werkt het alleen via het beginscherm).
- **Taal:** Nederlands.
- **Noodoplossing** (er is geen spelleider in de app): als het echt misgaat, kan Erik in het Supabase-dashboard `ends_at`/`status` aanpassen of een foto op `rejected` zetten. Documenteer in de README welke SQL je daarvoor nodig hebt.

---

## 6. Datamodel (Supabase / Postgres)

```sql
games (
  id uuid pk,
  join_code text unique,           -- bv. "BIER42"
  status text,                     -- 'lobby' | 'headstart' | 'running' | 'ended'
  started_at timestamptz,          -- T0
  police_start_at timestamptz,     -- T0 + headstart
  ends_at timestamptz,             -- opnieuw berekend bij elke bonus
  bonus_total_min int default 0,   -- opgebouwde aftrek, max settings.max_bonus_total_min
  winner text,                     -- 'thieves' | 'police' | null
  winning_team_id uuid null,       -- politieteam dat de vangst deed
  settings jsonb                   -- headstart_min 15, search_min 180, beer_bonus_min 10,
                                   -- sight_bonus_min 15, cooldown_min 10, max_bonus_total_min 120,
                                   -- bonus_during_headstart true, max_players_per_team 3,
                                   -- play_area (GeoJSON), time_scale 1 (testmodus)
)

teams (
  id uuid pk, game_id fk,
  role text,                       -- 'thieves' | 'police'
  name text,                       -- 'Boeven', 'Politie A', 'Politie B', 'Politie C'
  color text
)

players (
  id uuid pk, game_id fk, team_id fk,
  name text,
  device_id text,                  -- zodat herladen je sessie terugbrengt
  last_lat float, last_lng float,  -- alleen voor boeven onderling (optioneel, fase 7)
  last_seen_at timestamptz
)

sights (id int pk, name text, geometry jsonb, radius_m int)

photos (
  id uuid pk, game_id fk, player_id fk, team_id fk,
  type text,                       -- 'beer' | 'sight' | 'capture'
  storage_path text,
  lat float, lng float, accuracy_m float,
  sight_id int null,
  bar_name text null,              -- zoals ingetypt
  bar_name_norm text null,         -- genormaliseerd, voor de dubbelcheck
  bonus_min int default 0,         -- werkelijk afgetrokken minuten (0 als het plafond bereikt is)
  status text,                     -- 'accepted' | 'rejected'
  reject_reason text null,
  created_at timestamptz           -- servertijd
)

events (                           -- tijdlijn voor de feed en het eindoverzicht
  id bigserial pk, game_id fk,
  type text,                       -- 'game_started','police_released','bonus','bonus_cap_reached','capture','game_ended'
  payload jsonb, created_at timestamptz
)
```

**Row Level Security:** spelers mogen alleen lezen binnen hun eigen game. Foto's kunnen alleen via de RPC `submit_photo` worden weggeschreven. `players.last_lat/last_lng` zijn alleen leesbaar voor spelers van hetzelfde (boeven)team.

**Afgewezen foto's** worden wel opgeslagen (voor de lol en om te debuggen), maar komen niet in de feed. Alleen de boef die de foto maakte, ziet de reden.

**Realtime:** clients abonneren zich op `games` (eindtijd/status), `photos` en `events` voor hun eigen `game_id`.

---

## 7. Schermen

1. **Spel aanmaken** (eenmalig, door Erik de dag ervoor)
   Eén knop "Nieuw spel". Er komt een join-code uit plus een link om te delen in de groepsapp. Het spel krijgt automatisch de 4 teams.
2. **Join**
   Via de link of de join-code → naam invullen → team kiezen (vol bij 3 spelers). Uitleg "Zet deze app op je beginscherm" met afbeeldingen voor iPhone en Android.
3. **Lobby**
   Teams en spelers in realtime. Iedereen kan van team wisselen zolang het spel niet gestart is. Knop **Start spel** (3 seconden ingedrukt houden).
4. **Hoofdscherm** (voor iedereen)
   - Grote countdown bovenaan. Rood en knipperend onder de 10 minuten.
   - Tijdens de voorsprong ziet de politie "Jullie mogen over 12:34 vertrekken".
   - Balkje "Boeven hebben al 45 / 120 min afgetrokken".
   - Feed met foto's, de nieuwste bovenaan: icoon voor het type, speler, tijd, locatienaam en "−15 min".
   - Tabbalk: **Klok & feed · Kaart · Camera · Regels**.
5. **Kaart**
   - Het spelgebied als polygoon. De 10 bezienswaardigheden: grijs als ze gebruikt zijn, gekleurd als ze nog beschikbaar zijn. Pins van alle boevenfoto's met de tijd ("23 min geleden") en een fotootje.
   - Je eigen locatie als blauwe stip.
   - Boeven zien ook hun teamgenoten (optioneel, fase 7). De politie ziet nooit live locaties van de boeven, alleen fotopins.
6. **Camera: boeven**
   Kies "🍺 Bier" of "🏛️ Bezienswaardigheid" → live camera → foto → bevestigen.
   - Bij een bezienswaardigheid kiest de app zelf de dichtstbijzijnde geldige.
   - Bij bier typ je de naam van de kroeg, met autocomplete van de kroegen die al gebruikt zijn.
   - De app laat vooraf zien waarom iets niet kan: nog 4:12 wachttijd, al gebruikt, te ver weg of plafond bereikt.
7. **Camera: politie (vangstfoto)**
   Live camera → foto → "Boeven gevangen!" (bevestigen met een tweede tik) → eindscherm met confetti 🚓.
8. **Regels**
   Korte versie van §2, altijd bereikbaar.
9. **Eindscherm**
   - De winnaar groot in beeld: "Boeven ontsnapt!" of "Gevangen door Politie B!".
   - Statistieken: totale aftrek, aantal kroegen en bezienswaardigheden, speelduur.
   - Een tijdlijn, een fotogalerij en een kaart met de route van de boeven (fotopins op volgorde, verbonden met een lijn).
   - Knop "Download alle foto's (zip)".

---

## 8. Randgevallen

| Situatie | Wat de app doet |
|---|---|
| Aftrek maakt de resterende tijd ≤ 0 | Kan bijna niet door het plafond (3u − 2u = altijd minstens 1 uur). Gebeurt het toch, dan eindigt het spel en winnen de boeven. |
| Twee boeven sturen tegelijk een foto | De eerste die de server bereikt, telt. De tweede krijgt "wachttijd actief" of "al gebruikt". |
| Twee politieteams maken tegelijk een vangstfoto | De eerste die de server bereikt, wint. De andere krijgt "Te laat, Politie A was je voor". Zijn foto staat wel in de galerij. |
| Een boevenfoto komt binnen ná de vangst | Afgewezen: spel voorbij. |
| Een foto komt binnen ná `ends_at` | Afgewezen. De boeven hebben toch al gewonnen. |
| Een vangstfoto in de voorsprong | Kan niet: de politiecamera is geblokkeerd tot `police_start_at`. |
| Telefoon leeg of app gesloten | Opnieuw openen herstelt de sessie via `device_id` in localStorage. Teamgenoten spelen gewoon door. |
| Geen toestemming voor GPS of camera | De app blokkeert de camera en legt uit hoe je het aanzet (iOS: Instellingen → Safari → Locatie/Camera). |
| Pagina herladen | Alles komt uit de database, dus er gaat niets verloren. |
| Iemand drukt per ongeluk op Start | Dit wordt voorkomen doordat je 3 seconden moet vasthouden en alle teams gevuld moeten zijn. Noodoplossing: via het dashboard (§5). |

---

## 9. Bouwfasen voor Claude Code

Er is minder dan 2 weken. Laat Claude Code steeds één fase bouwen, testen en committen voordat je verdergaat. Richtlijn: **fase 0–5 in week 1, fase 6–7 in week 2.**

| Fase | Inhoud | Klaar als |
|---|---|---|
| **0. Setup** | Vite + React + TS + Tailwind, Supabase-project koppelen, env-variabelen, GitHub-repo, deploy naar Vercel, PWA-manifest en icoon | De lege app draait via HTTPS en is op het beginscherm te zetten |
| **1. Game & teams** | Tabellen, RLS, spel aanmaken, join met code/link, team kiezen (max 3), lobby met realtime spelerslijst | 4 telefoons zien elkaar in de lobby |
| **2. Klok-engine** | Starten (vasthouden), voorsprong, zoekklok, server-offset, einde bij 0; events-tabel; hoofdscherm met countdown | De klok loopt gelijk op alle toestellen, ook na herladen |
| **3. Bonusfoto's** | Camera, compressie, upload naar Storage, `submit_photo` met alle controles (wachttijd, dubbele kroeg/bezienswaardigheid, geofence, plafond), feed | Een foto geeft direct −10/−15 min bij iedereen; ongeldige foto's worden geweigerd met een duidelijke reden |
| **4. Kaart** | Leaflet, spelgebied, status van de bezienswaardigheden, fotopins, eigen locatie | De politie ziet waar elke foto gemaakt is |
| **5. Vangen & einde** | Vangstfoto, "eerste telt", eindscherm met winnaar | Een vangstfoto beëindigt het spel bij iedereen |
| **6. Afwerking** | Regelscherm, wake lock, trillen/meldingen, uploadwachtrij voor slecht bereik, iOS-uitleg, galerij + zip, route op de kaart, README met nood-SQL | Complete speelervaring |
| **7. Optioneel** | Boeven zien elkaar + waarschuwing "Blijf bij elkaar" | Alleen als er tijd over is |
| **8. Testen** | Zie §10 | Proefspel zonder fouten |

---

## 10. Testplan

1. **Snelle klok:** `settings.time_scale` (bv. 12 = 1 minuut in 5 seconden) zodat je een heel spel in ~15 minuten kunt testen.
2. **Nep-GPS:** in dev-modus (`?dev=1`) een locatie aantikken op de kaart, zodat je thuis de geofences van Düsseldorf kunt testen.
3. **Unit-tests** (Vitest) voor: de eindtijdberekening met plafond, de wachttijd, het normaliseren van kroegnamen en de dubbelcheck, de geofence per bezienswaardigheid, "eerste vangst telt" en de winconditie.
4. **Test op echte toestellen:** iPhone (Safari + PWA op beginscherm) en Android (Chrome). Camera, GPS, herladen en vliegtuigmodus aan/uit.
5. **Proefspel in je eigen stad** met 2–3 mensen en tijdelijke "bezienswaardigheden" in de buurt. Dat kan via een testgame met andere `sights`.
6. **De avond ervoor:** het echte spel aanmaken, de link in de groepsapp zetten en iedereen de app laten installeren en in de lobby laten joinen.

---

## 11. Genomen besluiten

| Onderwerp | Besluit |
|---|---|
| Speelduur | 15 min voorsprong + 3 uur zoektijd = 3u15 totaal |
| Locatie boeven | GPS-pin bij elke foto, geen live locatie voor de politie |
| Fotocontrole | Volledig automatisch, geen spelleider |
| Limieten | Elke kroeg 1×, elke bezienswaardigheid 1×, 10 min wachttijd, max 120 min aftrek, foto's direct zichtbaar voor iedereen |
| Vangen | Eén vangstfoto van het hele boeventeam; het eerste politieteam wint |
| Boeven | Eén team van 3 dat bij elkaar moet blijven |
| Teams | 12 spelers: 4 teams × 3 |
| Spelgebied | De hele weekendkaart (Altstadt t/m MedienHafen) |
| Kroegen | Vrije invoer met dubbelcheck op naam en GPS |
| Spelleider | Geen; noodingrepen alleen via het Supabase-dashboard |

Nog te controleren vóór het weekend: coördinaten van de bezienswaardigheden (§3) en de grenzen van het spelgebied (§2.4).

---

## 12. Kosten & privacy

- Supabase free tier + Vercel free tier: in principe **€ 0**.
- Foto's staan in een privé Storage-bucket. Alleen deelnemers met de join-code zien ze.
- Na het weekend: zip downloaden en de game + foto's verwijderen (SQL in de README).

---

## 13. Startprompt voor Claude Code

Plak dit in Claude Code in een lege map, met dit bestand erbij als `PLAN.md`:

```
Lees PLAN.md helemaal. Dit is de specificatie voor "Boevenjacht Düsseldorf",
een PWA (React + TypeScript + Vite + Tailwind + Supabase + Leaflet + Turf.js),
gehost op Vercel via GitHub. Ik heb al accounts voor Supabase, Vercel en GitHub.
Alle UI-teksten in het Nederlands, mobile-first. Het spel is over minder dan 2 weken.

Werk fase voor fase volgens §9. Begin met fase 0 en 1.
- Stel eerst vragen als iets in PLAN.md onduidelijk is.
- Zet het databaseschema in supabase/migrations/.
- Alle spelregels en tijdberekening server-side (Postgres RPC met row lock).
- Schrijf Vitest-tests voor de spellogica.
- Stop na elke fase, vertel wat ik moet testen en wacht op mijn akkoord.
```
