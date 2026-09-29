# Stadspakket data model

Status: voorstel voor het schema (week 1). Implementatie van het volledige spel op dit schema
is [COP-3](/COP/issues/COP-3) (week 2-4); dit document legt alleen het datamodel vast waarop
dat werk voortbouwt.

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

- Bevestigen: 10 bezienswaardigheden + welke kroegen voor het Utrecht-stadspakket (rode lijn
  loopt Erik zelf in week 5, zie `utrecht.md`) — nog niet ingevuld, dat is content, geen schema.
- Vertaalworkflow NL/EN: nu losse kolommen per taal; prima voor 2 talen, zou bij een 3e taal
  een aparte `city_translations`-tabel worden.
