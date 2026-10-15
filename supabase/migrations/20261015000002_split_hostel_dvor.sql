-- COP-95: Hostel Dvor als extra (9e) bezienswaardigheid op Split, op Eriks verzoek in een
-- reactie op de PR van de klooster-uitbreiding (20261015000001). Coordinaten rechtstreeks van
-- Erik: 43.5082 N, 16.4314 E.
--
-- Die coordinaat ligt ~27 m buiten de huidige rode lijn (net als eerder Pazar/Vidilica in
-- 20261014000001 en het klooster in 20261015000001): het dichtstbijzijnde lijnstuk loopt van de
-- Varoš-hoek (16.4326,43.5074) naar de al naar buiten geduwde Vidilica-hoek (16.431093,43.50893).
-- Zelfde aanpak als die twee eerdere keren: nieuw hoekpunt tussen die twee in, 25 m voorbij
-- Hostel Dvor naar buiten geduwd (richting weg van het gebiedsmiddelpunt). Resultaat is nog
-- steeds een convexe polygon (geverifieerd: alle 8 punten zijn hull-vertices) en Hostel Dvor,
-- Vidilica, Pazar en het klooster blijven allemaal binnen de nieuwe lijn.
--
-- Let op: de marge tussen Hostel Dvor en de dichtstbijzijnde rand is ~17 m, vergelijkbaar met de
-- ~19 m marge die het klooster in 20261015000001 al heeft — dus net als daar kan de buitenrand
-- van de foto-geofence-cirkel (radius_m) net over de rode lijn heen vallen. Zelfde risico, geen
-- nieuw probleem t.o.v. de vorige migratie.
--
-- Erik gaf alleen naam + coordinaten, geen trekpleister-tekst of foto-straal (anders dan zijn
-- oorspronkelijke 7 in 20261014000002). description_nl hieronder is daarom een neutrale
-- plaatshouder (geen verzonnen marketingclaim) en radius_m = 40 volgt de kleinere-cirkels-
-- conventie uit 20261014000003 (35-50 m), gelijk aan de andere kruispunt-achtige hoekpunten.
-- Open vraag aan Erik: eigen omschrijving + akkoord op de straal, zie issue-afsluiting.
--
-- Los migratiebestand i.p.v. 20261015000001 aanpassen: die kan al gedraaid zijn (zelfde reden als
-- steeds bij deze Split-reeks), dus dit moet een los, idempotent vervolg zijn.

update cities
   set red_line = private.geog('{
    "type": "Polygon",
    "coordinates": [[
      [16.4411,43.5097],[16.442709,43.508508],[16.4428,43.5065],
      [16.4326,43.5074],[16.431094,43.508166],[16.431093,43.50893],
      [16.4312,43.5092],[16.437973,43.511518],
      [16.4411,43.5097]
    ]]
  }'::jsonb)
 where slug = 'split';

insert into city_points_of_interest
  (city_id, kind, name_nl, description_nl, location, radius_m, photo_required, sort_order)
select c.id, 'bezienswaardigheid',
       'Hostel Dvor',
       'Extra stop op verzoek van Erik, nabij de Vidilica-hoek richting Marjan.',
       extensions.st_setsrid(extensions.st_makepoint(16.4314, 43.5082), 4326)::extensions.geography,
       40, true, 9
  from cities c
 where c.slug = 'split';
