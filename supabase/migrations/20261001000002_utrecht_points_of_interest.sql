-- COP-62: Utrecht bezienswaardigheden voor `city_points_of_interest` — AGENT-VOORSTEL.
--
-- 10 bezienswaardigheden (thema Politie & Proost, zie utrecht.md), gekozen uit publiek
-- bekende Utrechtse bezienswaardigheden binnen de rode-lijn-schets van 20261001000001.
-- Coördinaten komen uit publieke kaartbronnen (Wikipedia/Wikidata/gemeentelijke sites),
-- NIET zelf ter plekke gemeten. Net als bij Düsseldorf (PLAN.md §3): "benaderingen, controleer
-- en verfijn in Google Maps vóór het spel." Erik loopt de route in week 5 en kan namen,
-- volgorde of de keuze zelf nog aanpassen - dit is content, geen schema (zie
-- docs/stadspakket-data-model.md, "Open vragen voor Erik").
--
-- Geen partnerkroegen hier: die lopen via het bestaande vrije-invoer-systeem voor bierfoto's
-- (PLAN.md §4, normalize_bar_name) en worden pas met is_partner_pub = true gezet zodra sales
-- ze heeft benaderd/bevestigd (utrecht.md: doel 5, vanaf week 3) - dat is geen devwerk.
--
-- #5 (Oudegracht werfkelders) is net als Düsseldorfs Rheinuferpromenade/Kö een lijn (de
-- werfkelders lopen langs een stuk gracht); city_points_of_interest heeft alleen een
-- Point-kolom, dus hier als representatief middenpunt met de uitleg in description_nl.

insert into city_points_of_interest
  (city_id, kind, name_nl, description_nl, location, radius_m, photo_required, sort_order)
select c.id, 'bezienswaardigheid', v.name_nl, v.description_nl,
       extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography,
       v.radius_m, true, v.sort_order
  from cities c
  cross join (
    values
      ('Domtoren & Domplein',
       'Hoogste kerktoren van Nederland (112 m), icoon van Utrecht.',
       52.0908, 5.1213, 75, 1),
      ('Pandhof Domkerk',
       'Rustige kloostertuin direct achter de Dom.',
       52.0905, 5.1226, 40, 2),
      ('Stadhuis & Stadhuisbrug',
       'Stadhuis van Utrecht aan de Oudegracht - thema Politie/bestuur.',
       52.0914, 5.1197, 50, 3),
      ('Winkel van Sinkel',
       'Eerste warenhuis van Nederland (1839), nu een grand café aan de Oudegracht - thema Proost.',
       52.0919, 5.1187, 50, 4),
      ('Oudegracht werfkelders',
       'Lijn langs de werfkelders van de Oudegracht; hier als middenpunt (ter hoogte van de Vismarkt), de echte lijn loopt van Jansbrug tot Weesbrug.',
       52.0926, 5.1203, 50, 5),
      ('Museum Speelklok (Buurkerk)',
       'Voormalige Buurkerk, nu museum voor zelfspelende muziekinstrumenten.',
       52.0907, 5.1194, 50, 6),
      ('Neude',
       'Centraal plein met cafés, voormalig hoofdpostkantoor.',
       52.0931, 5.1178, 60, 7),
      ('Janskerkhof',
       'Plein met de Janskerk en terrassen, vlak bij de universiteit.',
       52.0931, 5.1214, 60, 8),
      ('Vredenburg & TivoliVredenburg',
       'Plein en muziekpodium, net ten oosten van het spoor (niet erin - veiligheid.md).',
       52.0922, 5.1140, 70, 9),
      ('Paushuize',
       'Enige bewaarde paleis van een Nederlandse paus (Adrianus VI), aan de Kromme Nieuwegracht.',
       52.0904, 5.1244, 50, 10)
  ) as v (name_nl, description_nl, lat, lng, radius_m, sort_order)
 where c.slug = 'utrecht';
