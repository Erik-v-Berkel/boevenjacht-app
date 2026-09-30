-- Stadspakketten: steden als data (rode lijn, verboden zones, bezienswaardigheden/kroegen).
-- Zie docs/stadspakket-data-model.md voor de toelichting en referenties.
-- Implementatie van het volledige spel (join, teams, scoring) is COP-3 t/m COP-9 (week 2-5),
-- deze migratie legt alleen het stadspakket-schema vast zodat dev daarop kan bouwen.

create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  theme text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- Speelgebied ("rode lijn"). Nooit langs/over drukke wegen, spoor of water als doorgang (veiligheid.md).
  red_line geography(Polygon, 4326) not null,
  default_locale text not null default 'nl' check (default_locale in ('nl', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists city_forbidden_zones (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities (id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('spoor', 'water', 'bouwplaats', 'priveterrein', 'drukke_weg', 'overig')),
  area geography(Polygon, 4326) not null,
  created_at timestamptz not null default now()
);

create table if not exists city_points_of_interest (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities (id) on delete cascade,
  kind text not null check (kind in ('bezienswaardigheid', 'kroeg')),
  name_nl text not null,
  name_en text,
  description_nl text,
  description_en text,
  location geography(Point, 4326) not null,
  photo_required boolean not null default true,
  is_partner_pub boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists city_forbidden_zones_city_id_idx on city_forbidden_zones (city_id);
create index if not exists city_points_of_interest_city_id_idx on city_points_of_interest (city_id);

-- RLS: de PWA leest stadspakketten met de anon-key. Schrijven gebeurt via het beheerscherm
-- (COP-6, met service-role of een aparte RPC) en valt buiten deze policies.
alter table cities enable row level security;
alter table city_forbidden_zones enable row level security;
alter table city_points_of_interest enable row level security;

create policy "publiek leest actieve stadspakketten" on cities
  for select using (status = 'active');

create policy "publiek leest verboden zones van actieve steden" on city_forbidden_zones
  for select using (
    exists (select 1 from cities where cities.id = city_forbidden_zones.city_id and cities.status = 'active')
  );

create policy "publiek leest bezienswaardigheden van actieve steden" on city_points_of_interest
  for select using (
    exists (select 1 from cities where cities.id = city_points_of_interest.city_id and cities.status = 'active')
  );
