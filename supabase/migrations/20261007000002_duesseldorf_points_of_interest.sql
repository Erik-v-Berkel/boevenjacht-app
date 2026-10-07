-- COP-57: Düsseldorf bezienswaardigheden voor het stadspakket (city_points_of_interest).
-- Coördinaten van Erik (issue-comment), gekruist met de al goedgekeurde sight_templates-data.
--
-- radius_m per punt komt uit Erik's eigen tabel (straal-kolom), niet uit de generieke
-- default van 60 die 20260930000006_city_driven_game.sql op de kolom zet.
--
-- Königsallee (#5) staat hier meteen op de rechtgetrokken lijn uit 20261001000006
-- (fix_konigsallee_skew), niet op de oorspronkelijke scheve lijn - dat scheelt een latere
-- correctie-migratie voor deze tabel.
--
-- #4 Rheinuferpromenade en #7 Hofgarten: het schema heeft alleen een punt-kolom, dus die
-- staan op een representatief punt; de echte lijn/gebied-omvang staat in description_nl.
--
-- `where not exists` maakt dit veilig om te draaien op een omgeving waar deze stad al
-- bezienswaardigheden heeft (prod, handmatig ingevoerd door Erik) zonder duplicaten te maken.

insert into city_points_of_interest
  (city_id, kind, name_nl, description_nl, location, radius_m, photo_required, sort_order)
select c.id, v.kind, v.name_nl, v.description_nl,
       extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography,
       v.radius_m, true, v.sort_order
  from cities c
  cross join (
    values
      ('bezienswaardigheid', 'Burgplatz & Schlossturm',      null,                                                                                             51.227278, 6.771180, 100, 1),
      ('bezienswaardigheid', 'St. Lambertus Basilika',        null,                                                                                             51.2289,   6.7729,   100, 2),
      ('bezienswaardigheid', 'Rathaus & Jan-Wellem-Denkmal',  null,                                                                                             51.225850, 6.772048, 75,  3),
      ('bezienswaardigheid', 'Rheinuferpromenade',            'Lijn langs de Rijn, noordeinde 51.2330,6.7728 - zuideinde 51.2165,6.7610; hier als middenpunt.', 51.22475,  6.76690,  40,  4),
      ('bezienswaardigheid', 'Königsallee',                   'Lijn over de gracht (rechtgetrokken, COP-64), noordeinde 51.2265,6.7790 - zuideinde 51.2174,6.7789; hier als middenpunt.', 51.22195,  6.77895,  50,  5),
      ('bezienswaardigheid', 'Carlsplatz',                    null,                                                                                             51.223749, 6.773273, 80,  6),
      ('bezienswaardigheid', 'Hofgarten',                     'Gebied, ca. 20 m marge rond het middenpunt.',                                                   51.2305,   6.7825,   20,  7),
      ('bezienswaardigheid', 'K20 Kunstsammlung NRW',         null,                                                                                             51.228404, 6.775618, 100, 8),
      ('bezienswaardigheid', 'MedienHafen / Gehry-Bauten',    null,                                                                                             51.216456, 6.757634, 100, 9),
      ('bezienswaardigheid', 'Rheinturm',                     null,                                                                                             51.217865, 6.761749, 75,  10)
  ) as v (kind, name_nl, description_nl, lat, lng, radius_m, sort_order)
 where c.slug = 'dusseldorf'
   and not exists (select 1 from city_points_of_interest p where p.city_id = c.id);
