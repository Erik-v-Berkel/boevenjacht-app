-- COP-95: Split-speelgebied naar boven uitbreiden tot aan het klooster "Gospa od Zdravlja"
-- (Our Lady of Health / "Moeder Gods van Gezondheid").
--
-- Erik vroeg het gebied "naar boven uit te breiden tot aan de kerk" en de coordinaten van het
-- klooster zelf op te zoeken (die had hij niet bij de hand, anders dan de 4 hoekpunten uit
-- COP-92). AGENT-RESEARCH, geen Erik-data: Wikidata (Q12629266) en Tripadvisor geven voor
-- "Franjevacki samostan i crkva Gospe od Zdravlja" (Trg Gaje Bulata 3, Split) onafhankelijk
-- dezelfde coordinaat: 43 30'40.644"N 16 26'16.368"E => 43.5113, 16.4379. Dat is het plein
-- direct naast het Kroatisch Nationaal Theater (HNK Split), een voetgangersplein in het
-- centrum — geen spoor, drukke doorgaande weg of water (veiligheid.md).
--
-- De bestaande rode lijn (20261014000001) haalt noordelijk niet verder dan 43.5097 (hoekpunt
-- Park Djardin). Het klooster op 43.5113 ligt daar duidelijk voorbij. Net als bij Pazar/Vidilica
-- in 20261014000001: niet de kale polygon + los punt, want submit_photo wijst foto's buiten
-- play_area af los van de bezienswaardigheid-straal. Oplossing: convex hull van de 6 bestaande
-- hoekpunten + het klooster, met het nieuwe hoekpunt ~25 m voorbij het klooster de polygon uit
-- geduwd (richting weg van het gebiedsmiddelpunt), zodat het klooster zelf ruim binnen de
-- foto-geofence valt in plaats van op de rand te liggen. Resultaat is nog steeds een convexe
-- 7-punts-polygon (bevestigd: alle 7 punten zijn hull-vertices, geen concaaf stuk).
--
-- Net als bij de twee bestaande uitgeduwde hoekpunten: dit is een AGENT-TOEVOEGING op Eriks
-- oorspronkelijke 4 hoekpunten, geen geverifieerde looproute. Blijft bewust op status = 'draft'
-- (ongewijzigd) in afwachting van Eriks akkoord op de volledige rode lijn — zie open vraag in de
-- issue-afsluiting.
--
-- Los migratiebestand i.p.v. 20261014000001 aanpassen, zelfde reden als 20261014000003: die kan
-- al gedraaid zijn, dus dit moet een los, idempotent vervolg zijn.

update cities
   set red_line = private.geog('{
    "type": "Polygon",
    "coordinates": [[
      [16.4411,43.5097],[16.442709,43.508508],[16.4428,43.5065],
      [16.4326,43.5074],[16.431093,43.50893],[16.4312,43.5092],
      [16.437973,43.511518],
      [16.4411,43.5097]
    ]]
  }'::jsonb)
 where slug = 'split';

-- Het klooster zelf als 8e bezienswaardigheid, binnen de nieuwe polygon (niet op het uitgeduwde
-- hoekpunt). radius_m volgt de kleinere-cirkels-conventie uit 20261014000003 (35-50 m voor een
-- gewoon plein); 40 m voor een plein van vergelijkbare omvang als de andere kruispunt-achtige
-- bezienswaardigheden.
insert into city_points_of_interest
  (city_id, kind, name_nl, description_nl, location, radius_m, photo_required, sort_order)
select c.id, 'bezienswaardigheid',
       'Klooster Gospa od Zdravlja (De Noordgrens bij het Theater)',
       'Het 19e-eeuwse kloosterkerkje aan het plein naast het Kroatisch Nationaal Theater — het '
       'nieuwe noordelijke eindpunt van de speelzone.',
       extensions.st_setsrid(extensions.st_makepoint(16.4379, 43.5113), 4326)::extensions.geography,
       40, true, 8
  from cities c
 where c.slug = 'split';
