-- COP-57 vervolg: Erik checkte alle Düsseldorf-coördinaten in Google Maps en gaf een
-- gecorrigeerd punt door voor St. Lambertus Basilika (51.228146, 6.772064 i.p.v. 51.2289,
-- 6.7729 - zo'n 100 m verschil, wat gezien de straal van 100 m het geofence-gedrag raakt).
--
-- Idempotent: een omgeving die via 20261007000002 is opgezet heeft dit punt al correct
-- staan, dus deze update is dan een no-op.

update city_points_of_interest as p
   set location = extensions.st_setsrid(extensions.st_makepoint(6.772064, 51.228146), 4326)::extensions.geography
 where p.name_nl = 'St. Lambertus Basilika'
   and p.city_id = (select id from cities where slug = 'dusseldorf');
