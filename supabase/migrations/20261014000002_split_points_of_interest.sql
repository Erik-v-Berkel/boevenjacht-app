-- COP-92: Split bezienswaardigheden voor `city_points_of_interest`.
--
-- 7 bezienswaardigheden, rechtstreeks overgenomen uit Eriks lijst in de issue (naam, bijnaam,
-- coördinaten en trekpleister-tekst komen allemaal van hem, geen agent-research zoals bij
-- Utrecht/COP-62). name_nl combineert zijn naam + bijnaam; description_nl is zijn
-- trekpleister-tekst. radius_m volgt de bestaande conventie (60 m standaard, 75 m voor het
-- centrale paleisplein — vergelijkbaar met Domplein/Burgplatz in Utrecht/Düsseldorf).
--
-- #3 (Pazar) en #7 (Prva Vidilica) liggen net buiten de kale 4-punts-vierhoek van Eriks
-- hoekcoördinaten; de rode lijn in 20261014000001 is daarom verruimd (convex hull + buffer) zodat
-- de foto-geofence (play_area-check in submit_photo) deze twee niet blokkeert. Zie die migratie
-- voor de toelichting.
--
-- Geen kroegen hier (kind = 'bezienswaardigheid' only): net als bij Utrecht lopen partnerkroegen
-- via het vrije-invoer-systeem (PLAN.md §4) en worden pas toegevoegd met is_partner_pub = true
-- zodra sales ze heeft benaderd — geen devwerk.

insert into city_points_of_interest
  (city_id, kind, name_nl, description_nl, location, radius_m, photo_required, sort_order)
select c.id, 'bezienswaardigheid', v.name_nl, v.description_nl,
       extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography,
       v.radius_m, true, v.sort_order
  from cities c
  cross join (
    values
      ('De Peristil & Kathedraal van Sint-Domnius (Het Romeinse Hart)',
       'Het centrale paleisplein met de eeuwenoude sfinx en de iconische klokkentoren.',
       43.5081, 16.4403, 75, 1),
      ('Grgur Ninski & De Gouden Poort (De Noordelijke Uitgang)',
       'Het gigantische standbeeld van de bisschop. Perfect voor een verplichte '
       '"raak de gouden teen aan"-foto-opdracht.',
       43.5094, 16.4402, 60, 2),
      ('Busstation Pazar & De Groene Markt (De Oostelijke Poort)',
       'De levendige, grote buitenmarkt van Split. Dé plek voor de OV-ontsnapping.',
       43.5085, 16.4424, 60, 3),
      ('Het Fruitplein (Trg Braće Radić) & De Riva (De Boulevard)',
       'Het sfeervolle plein met de 15e-eeuwse Venetiaanse toren, direct achter de boulevard. '
       'Ideaal voor de step.',
       43.5076, 16.4390, 50, 4),
      ('Prokurative (Trg Republike) (Het ''Venetiaanse'' Plein)',
       'Het opvallende, volledig rode plein met grote neo-renaissance bogen aan de westkant van '
       'het centrum.',
       43.5083, 16.4372, 60, 5),
      ('Hart van Varoš (Kruispunt Šperun) (De Doolhofwijk)',
       'De toegangspoort tot de oude, authentieke visserswijk vol steile stenen trappen. Hier '
       'moet iedereen te voet.',
       43.5088, 16.4339, 50, 6),
      ('Prva Vidilica (Marjan Uitkijkpunt) (Het Hoogste Punt)',
       'Hét ansichtkaart-uitkijkpunt op de Marjan-heuvel met een grandioos uitzicht over de hele '
       'speelzone.',
       43.5089, 16.4314, 60, 7)
  ) as v (name_nl, description_nl, lat, lng, radius_m, sort_order)
 where c.slug = 'split';
