-- Producten (Go / Business) en boekingen (checkout-aanvragen).
-- Zie docs/stadspakket-data-model.md voor de toelichting.
-- Prijsberekening (incl. lanceeraanbod: eerste 10 groepen -25%) gebeurt server-side in
-- submit_booking(), niet in de client — zie AGENTS.md regel 3 (spelregels/berekeningen server-side).

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('go', 'business_self', 'business_host')),
  name_nl text not null,
  name_en text,
  -- Prijs excl. btw, per persoon, in centen (bron: boevenjacht-kennis/prijzen.md).
  price_cents integer not null check (price_cents > 0),
  requires_host boolean not null default false,
  min_players int not null default 2,
  -- Eén boeventeam + max. 5 politieteams van elk max. 3 spelers (spelregels.md).
  max_players int not null default 18,
  -- business_host start inactief: aanbieden vereist bevestiging van Erik dat er een host
  -- beschikbaar is (open vraag, zie boevenjacht-kennis/prijzen.md).
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities (id),
  product_id uuid not null references products (id),
  participant_count int not null check (participant_count > 0),
  contact_name text not null,
  contact_email text not null,
  locale text not null default 'nl' check (locale in ('nl', 'en')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  -- Definitieve prijs excl. btw in centen, berekend door submit_booking() — nooit door de client aangeleverd.
  price_cents_total integer not null check (price_cents_total >= 0),
  launch_offer_applied boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists bookings_city_id_idx on bookings (city_id);
create index if not exists bookings_product_id_idx on bookings (product_id);

insert into products (slug, name_nl, name_en, price_cents, requires_host, min_players, max_players, active, sort_order)
values
  ('go', 'Go', 'Go', 1500, false, 2, 18, true, 1),
  ('business_self', 'Business (zelf spelen)', 'Business (self-guided)', 2900, false, 2, 18, true, 2),
  ('business_host', 'Business (met host)', 'Business (with host)', 3900, true, 2, 18, false, 3)
on conflict (slug) do nothing;

-- RLS: producten zijn publiek leesbaar (net als cities). Boekingen bevatten contactgegevens
-- (naam/e-mail) en zijn nooit direct leesbaar via de anon-key; alle toegang loopt via de
-- security-definer RPC's hieronder (die als functie-eigenaar RLS omzeilen, zie Supabase-doc).
alter table products enable row level security;
alter table bookings enable row level security;

create policy "publiek leest actieve producten" on products
  for select using (active = true);

-- Server-side boekingsflow: prijs (incl. lanceeraanbod) en validatie gebeuren hier met een
-- advisory lock, zodat gelijktijdige boekingen elkaar niet voorbij lopen bij het tellen van
-- de eerste 10 lanceergroepen (analoog aan de row-lock voor spelregels, zie AGENTS.md).
create or replace function submit_booking(
  p_city_slug text,
  p_product_slug text,
  p_participant_count int,
  p_contact_name text,
  p_contact_email text,
  p_locale text default 'nl'
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city cities%rowtype;
  v_product products%rowtype;
  v_launch_count int;
  v_launch_offer boolean;
  v_total_cents int;
  v_booking bookings%rowtype;
begin
  if p_contact_name is null or length(trim(p_contact_name)) < 2 then
    raise exception 'contactnaam is verplicht';
  end if;

  if p_contact_email is null or p_contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'ongeldig e-mailadres';
  end if;

  select * into v_city from cities where slug = p_city_slug and status = 'active';
  if not found then
    raise exception 'onbekend of niet actief stadspakket: %', p_city_slug;
  end if;

  select * into v_product from products where slug = p_product_slug and active = true;
  if not found then
    raise exception 'onbekend of niet actief product: %', p_product_slug;
  end if;

  if p_participant_count is null
     or p_participant_count < v_product.min_players
     or p_participant_count > v_product.max_players then
    raise exception 'aantal deelnemers moet tussen % en % liggen', v_product.min_players, v_product.max_players;
  end if;

  perform pg_advisory_xact_lock(hashtext('boevenjacht_launch_offer'));

  select count(*) into v_launch_count from bookings where status <> 'cancelled';
  v_launch_offer := v_launch_count < 10;

  v_total_cents := v_product.price_cents * p_participant_count;
  if v_launch_offer then
    v_total_cents := round(v_total_cents * 0.75);
  end if;

  insert into bookings (
    city_id, product_id, participant_count, contact_name, contact_email,
    locale, status, price_cents_total, launch_offer_applied
  ) values (
    v_city.id, v_product.id, p_participant_count, trim(p_contact_name), lower(trim(p_contact_email)),
    coalesce(p_locale, 'nl'), 'pending', v_total_cents, v_launch_offer
  ) returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function submit_booking(text, text, int, text, text, text) from public;
grant execute on function submit_booking(text, text, int, text, text, text) to anon, authenticated;

-- Publiek, alleen-lezen tellertje voor de lanceerbanner in de UI ("nog X van de 10 plekken").
-- Telt niet als het lezen van boekingen: geeft geen contactgegevens prijs.
create or replace function launch_offer_slots_remaining()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select greatest(0, 10 - count(*)::int) from bookings where status <> 'cancelled';
$$;

grant execute on function launch_offer_slots_remaining() to anon, authenticated;
