-- COP-57: Düsseldorf bezienswaardigheden voor het stadspakket (city_points_of_interest).
-- Coördinaten van Erik (issue-comment) en gekruist met de al goedgekeurde sight_templates-data
-- (20260930000001_sight_coordinates.sql, 20260924000001_bonus_photos.sql) - komt overeen.
--
-- Draait na 20260930000005_duesseldorf_city.sql (die zet de `cities`-rij met slug 'dusseldorf'
-- neer). city_forbidden_zones blijft nog leeg - zie COP-57.
--
-- #4 Rheinuferpromenade en #5 Königsallee zijn lijnen, #7 Hofgarten is een gebied; het huidige
-- city_points_of_interest-schema heeft alleen een Point-kolom, dus die drie staan hier op een
-- representatief punt (middenpunt). De echte lijn/gebied-omvang staat in description_nl.

insert into city_points_of_interest
  (city_id, kind, name_nl, description_nl, location, photo_required, sort_order)
select c.id, v.kind, v.name_nl, v.description_nl,
       extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography,
       true, v.sort_order
  from cities c
  cross join (
    values
      ('bezienswaardigheid', 'Burgplatz & Schlossturm',      null,                                                                    51.227278, 6.771180, 1),
      ('bezienswaardigheid', 'St. Lambertus Basilika',        null,                                                                    51.2289,   6.7729,   2),
      ('bezienswaardigheid', 'Rathaus & Jan-Wellem-Denkmal',  null,                                                                    51.225850, 6.772048, 3),
      ('bezienswaardigheid', 'Rheinuferpromenade',            'Lijn langs de Rijn, noordeinde 51.2330,6.7728 - zuideinde 51.2165,6.7610; hier als middenpunt.', 51.22475,  6.76690,  4),
      ('bezienswaardigheid', 'Königsallee',                   'Lijn over de gracht, noordeinde 51.2256,6.7797 - zuideinde 51.2187,6.7783; hier als middenpunt.', 51.22215,  6.77900,  5),
      ('bezienswaardigheid', 'Carlsplatz',                    null,                                                                    51.223749, 6.773273, 6),
      ('bezienswaardigheid', 'Hofgarten',                     'Gebied, ca. 20 m marge rond het middenpunt.',                          51.2305,   6.7825,   7),
      ('bezienswaardigheid', 'K20 Kunstsammlung NRW',         null,                                                                    51.228404, 6.775618, 8),
      ('bezienswaardigheid', 'MedienHafen / Gehry-Bauten',    null,                                                                    51.216456, 6.757634, 9),
      ('bezienswaardigheid', 'Rheinturm',                     null,                                                                    51.217865, 6.761749, 10)
  ) as v (kind, name_nl, description_nl, lat, lng, sort_order)
 where c.slug = 'dusseldorf';
