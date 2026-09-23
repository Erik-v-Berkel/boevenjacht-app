-- Gecontroleerde coördinaten en stralen van de bezienswaardigheden (Google Maps).
-- Alleen het sjabloon: nieuwe spellen krijgen deze versie, bestaande spellen houden hun eigen kopie.
-- Rheinuferpromenade (4), Königsallee (5) en Hofgarten (7) zijn goedgekeurd zoals ze waren.

update private.sight_templates as s
   set geometry = jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(v.lng, v.lat)),
       radius_m = v.radius_m
  from (values
    (1,  51.227278, 6.771180, 100),  -- Burgplatz & Schlossturm
    (2,  51.2289,   6.7729,   100),  -- St. Lambertus Basilika
    (3,  51.225850, 6.772048, 75),   -- Rathaus & Jan-Wellem-Denkmal
    (6,  51.223749, 6.773273, 80),   -- Carlsplatz
    (8,  51.228404, 6.775618, 100),  -- K20 Kunstsammlung NRW
    (9,  51.216456, 6.757634, 100),  -- MedienHafen / Gehry-Bauten
    (10, 51.217865, 6.761749, 75)    -- Rheinturm
  ) as v (id, lat, lng, radius_m)
 where s.id = v.id;
