-- COP-57 vervolg: prod kreeg de Düsseldorf-bezienswaardigheden al rechtstreeks via de SQL
-- editor (Erik plakte de kant-en-klare insert uit de issue-comment), vóórdat
-- 20261007000002 het schema met de juiste radius_m/Königsallee-punt vastlegde. Deze
-- migratie haalt een al bestaande Düsseldorf-set bij:
--
-- 1. radius_m stond op de generieke default (60, uit 20260930000006_city_driven_game.sql)
--    i.p.v. Erik's eigen straal per bezienswaardigheid - dat maakt sommige foto-geofences te
--    ruim (bv. Hofgarten, bedoeld als 20 m) en andere te strak (bv. Burgplatz, bedoeld als
--    100 m, zou foto's op de juiste plek onterecht kunnen afwijzen).
-- 2. Königsallee (#5) stond nog op de scheve lijn van vóór 20261001000006
--    (fix_konigsallee_skew); dit zet 'm op de rechtgetrokken lijn.
--
-- Idempotent: een omgeving die via 20261007000002 is opgezet heeft deze waarden al correct
-- staan, dus deze update is dan een no-op (de kolommen zijn al gelijk).

update city_points_of_interest as p
   set radius_m = v.radius_m
  from (
    values
      ('Burgplatz & Schlossturm',      100),
      ('St. Lambertus Basilika',       100),
      ('Rathaus & Jan-Wellem-Denkmal', 75),
      ('Rheinuferpromenade',           40),
      ('Königsallee',                  50),
      ('Carlsplatz',                   80),
      ('Hofgarten',                    20),
      ('K20 Kunstsammlung NRW',        100),
      ('MedienHafen / Gehry-Bauten',   100),
      ('Rheinturm',                    75)
  ) as v (name_nl, radius_m)
 where p.name_nl = v.name_nl
   and p.city_id = (select id from cities where slug = 'dusseldorf')
   and p.radius_m is distinct from v.radius_m;

update city_points_of_interest as p
   set location = extensions.st_setsrid(extensions.st_makepoint(6.77895, 51.22195), 4326)::extensions.geography,
       description_nl = 'Lijn over de gracht (rechtgetrokken, COP-64), noordeinde 51.2265,6.7790 - zuideinde 51.2174,6.7789; hier als middenpunt.'
 where p.name_nl = 'Königsallee'
   and p.city_id = (select id from cities where slug = 'dusseldorf');
