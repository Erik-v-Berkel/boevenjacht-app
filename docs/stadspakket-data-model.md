# Stadspakket data model

Status: voorstel voor het schema (week 1). Implementatie van het volledige spel op dit schema
is [COP-3](/COP/issues/COP-3) (week 2-4); dit document legt alleen het datamodel vast waarop
dat werk voortbouwt.

## Implementatiestatus (COP-3)

- `create_game(p_admin_code, p_settings, p_city_slug)` kan sinds
  `20260930000006_city_driven_game.sql` een stadspakket kiezen: de rode lijn gaat naar
  `games.settings.play_area` en de bezienswaardigheden (`kind = 'bezienswaardigheid'`) gaan naar
  `sights`, net zoals voorheen alleen de Düsseldorf-sjabloon deed. Zonder `p_city_slug` blijft het
  oude gedrag (Düsseldorf-sjabloon) ongewijzigd.
- `city_points_of_interest.radius_m` is toegevoegd (default 60 m) — nodig voor de foto-geofence,
  stond nog niet in het oorspronkelijke schema.
- **Nog niet gedekt:** `submit_photo` toetst foto's alleen tegen `settings.play_area`, nog niet
  tegen `city_forbidden_zones`. Die tabel bestaat en heeft een RLS-policy, maar wordt nog nergens
  door de spellogica gelezen — vervolgwerk binnen COP-3.
- **Utrecht-inhoud** (rode lijn + 10 bezienswaardigheden) staat hier nog niet in: dat is
  veiligheidsdata die Erik zelf moet lopen/bevestigen (zie `veiligheid.md`, "nooit"-regel in
  `boevenjacht-bestuur`), niet iets een agent kan verzinnen.

## Doel

Elke stad (Utrecht, en later de testversie Düsseldorf) is data, geen code: een "stadspakket"
bestaat uit een speelgebied ("rode lijn"), verboden zones, en bezienswaardigheden/kroegen.
Zie `boevenjacht-kennis` → `references/utrecht.md` en `references/spelregels.md`.

## Tabellen (migratie: `supabase/migrations/0001_stadspakketten.sql`)

### `cities`
Eén rij per stad.

| Kolom | Type | Toelichting |
| --- | --- | --- |
| `id` | uuid | primary key |
| `slug` | text | uniek, bv. `utrecht`, `dusseldorf` |
| `name` | text | weergavenaam |
| `theme` | text | bv. `politie-proost` (Utrecht) |
| `status` | text | `draft` / `active` / `archived` — alleen `active` steden zijn zichtbaar voor spelers |
| `red_line` | geography(Polygon) | het speelgebied. **Nooit langs/over drukke wegen, spoor of water als doorgang** (veiligheid.md) |
| `default_locale` | text | `nl` of `en` |

### `city_forbidden_zones`
Uitsluitingsgebieden binnen of grenzend aan de rode lijn (spoor, water, bouwplaatsen, privéterrein).
Meerdere rijen per stad. Server-side geofence-checks (RPC) moeten hier altijd tegen toetsen,
niet alleen tegen de rode lijn.

### `city_points_of_interest`
Bezienswaardigheden én kroegen in één tabel (`kind` onderscheidt ze), met NL/EN-teksten.
Utrecht: 10 bezienswaardigheden (thema Politie/Proost). Kroegen krijgen `is_partner_pub`
zodra ze benaderd/bevestigd zijn (sales, vanaf week 3); tot die tijd `false`.

## Producten, prijzen en boekingen (migratie: `supabase/migrations/0002_products_and_bookings.sql`)

### `products`
Eén rij per pakket: `go` (€15pp), `business_self` (€29pp), `business_host` (€39pp, `requires_host`).
Prijzen komen uit `boevenjacht-kennis` → `references/prijzen.md`, excl. btw (btw-tarief ligt nog
niet vast bij de Belastingdienst — de UI toont daarom nooit een bedrag incl. btw).
`business_host` staat bij lancering op `active = false`: aanbieden is een open vraag aan Erik
(bevestiging dat er een host beschikbaar is, zie prijzen.md).

### `bookings`
Eén rij per checkout-aanvraag: stad, product, aantal deelnemers, contactgegevens, status
(`pending` → `confirmed`/`cancelled`) en het door de server berekende totaalbedrag. Bevat
persoonsgegevens (naam/e-mail) en is daarom nooit direct leesbaar via de anon-key.

### RPC's
- `submit_booking(...)`: enige schrijfpad voor boekingen. Valideert stad/product/aantal
  deelnemers en berekent de definitieve prijs zelf — de client stuurt nooit een prijs mee.
  Gebruikt `pg_advisory_xact_lock` om het lanceeraanbod (eerste 10 groepen, 25% korting)
  race-condition-vrij te tellen, analoog aan de row-lock voor spelregels (AGENTS.md regel 3).
- `launch_offer_slots_remaining()`: publiek, alleen-lezen tellertje voor de lanceerbanner in de
  UI ("nog X van de 10 plekken"), zonder boekingen of contactgegevens bloot te geven.

Dit dekt alleen de checkout-aanvraag (COP-46). Betaling (Mollie) volgt in week 3–4; tot die tijd
is een boeking een aanvraag die Erik/support handmatig bevestigt.

## Bewuste keuzes

- **PostGIS** (`geography(Polygon/Point, 4326)`) voor `red_line`, `forbidden_zones` en
  `location`: exacte point-in-polygon checks horen **server-side** te gebeuren (spelregel:
  tijdberekening en foto-acceptatie via een Postgres RPC met row lock, zie `AGENTS.md`).
  PostGIS is een gratis Postgres-extensie, geen aparte betaalde dienst.
- **Client-side voorcheck**: `src/geofence.ts` gebruikt Turf.js (al lokaal, geen API-kosten)
  voor snelle feedback in de app ("je verlaat het speelgebied"). Dit is nooit de
  autoritatieve beslissing — die blijft de server-RPC.
- **RLS**: spelers lezen stadspakketten met de Supabase anon-key; policies staan alleen
  `select` toe op `status = 'active'` rijen. Schrijven (stadspakket samenstellen/wijzigen)
  gaat via het beheerscherm ([COP-6](/COP/issues/COP-6)) met de service-role — geen publieke
  schrijftoegang.
- **Geen aparte `pubs`-tabel**: kroegen en bezienswaardigheden delen dezelfde vorm (naam,
  locatie, foto-eis, NL/EN-tekst), dus één tabel met een `kind`-kolom in plaats van twee
  bijna-identieke tabellen.

## Open vragen voor Erik

- Bevestigen: 10 bezienswaardigheden + rode lijn voor het Utrecht-stadspakket. COP-62 heeft een
  eerste voorstel (`status = 'draft'`, dus onzichtbaar op `/boeken`) ingevoerd met publiek
  opzoekbare coördinaten — geen van de agent zelf gelopen/gemeten route. Erik loopt de rode lijn
  zelf in week 5 (zie `utrecht.md`) en past namen/volgorde/grens aan voordat de stad op `active`
  gaat. Kroegen: nog geen (apart, via sales, zie `utrecht.md`).
- Vertaalworkflow NL/EN: nu losse kolommen per taal; prima voor 2 talen, zou bij een 3e taal
  een aparte `city_translations`-tabel worden.
