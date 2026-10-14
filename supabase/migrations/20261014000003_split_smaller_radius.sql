-- COP-92: kleinere foto-geofences voor de Split-bezienswaardigheden.
--
-- Erik, na het bekijken van de eerste versie (20261014000002): "De cirkels van de
-- bezienswaardigheden mogen wel wat kleiner". Geen exact getal gegeven, dus ~30% kleiner per
-- plek, met de relatieve verhouding (groot plein > klein kruispunt) ongewijzigd en een bodem van
-- 35 m (niet kleiner, anders wordt de foto-geofence onbruikbaar strak t.o.v. normale GPS-ruis in
-- een oude binnenstad). Los migratiebestand i.p.v. 20261014000002 aanpassen: die kan al gedraaid
-- zijn (zie de SQL die in de issue is gedeeld), dus dit moet een los, idempotent vervolg zijn.

update city_points_of_interest cpi
   set radius_m = v.radius_m
  from cities c,
       (values
         ('De Peristil & Kathedraal van Sint-Domnius (Het Romeinse Hart)', 50),
         ('Grgur Ninski & De Gouden Poort (De Noordelijke Uitgang)', 40),
         ('Busstation Pazar & De Groene Markt (De Oostelijke Poort)', 40),
         ('Het Fruitplein (Trg Braće Radić) & De Riva (De Boulevard)', 35),
         ('Prokurative (Trg Republike) (Het ''Venetiaanse'' Plein)', 40),
         ('Hart van Varoš (Kruispunt Šperun) (De Doolhofwijk)', 35),
         ('Prva Vidilica (Marjan Uitkijkpunt) (Het Hoogste Punt)', 40)
       ) as v (name_nl, radius_m)
 where cpi.city_id = c.id
   and c.slug = 'split'
   and cpi.name_nl = v.name_nl;
