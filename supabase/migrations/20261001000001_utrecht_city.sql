-- COP-62: Utrecht-rij voor `cities` (stadspakket/boeken).
--
-- Status quo (anders dan Düsseldorf/COP-57): voor Utrecht bestond nog geen enkele rode lijn of
-- POI-lijst, van Erik of uit een eerder plan-document. utrecht.md zegt: "Dev maakt het in
-- week 2-4 als data in de tabel cities; Erik loopt de rode lijn in week 5 en keurt goed." Dit
-- was dus bewust het "dev maakt een eerste versie"-deel.
--
-- red_line hieronder is een AGENT-SCHATTING op basis van publieke kaartbronnen (zie de
-- voorstel-tekst in COP-62 voor bronnen per bezienswaardigheid): een ruime lus binnen de
-- Utrechtse singels, rond de 10 bezienswaardigheden in 20261001000002, met de westgrens net
-- ten oosten van Utrecht Centraal/Hoog Catharijne (spoor, geen doorgang - veiligheid.md).
-- NIET zelf geverifieerd te voet.
--
-- status = 'active' op expliciet verzoek van Erik (COP-62-interactie, 2026-10-01: "zet er maar
-- alvast in, zodat we het ook al kunnen testen. Later lopen we zelf de route, dus wel zichtbaar
-- voor bezoekers al") - dus bewust vóór de fysieke bevestiging in week 5, in afwijking van de
-- voorzichtigere Düsseldorf/COP-57-aanpak. De rode lijn blijft tot die tijd een schatting; mocht
-- lopen in week 5 een probleem aan het licht brengen (bijv. een stuk langs een drukke weg), dan
-- is een vervolgmigratie nodig om de grens/POI's bij te stellen.

insert into cities (slug, name, theme, status, red_line)
values (
  'utrecht',
  'Utrecht',
  'Politie & Proosttocht',
  'active',
  private.geog('{
    "type": "Polygon",
    "coordinates": [[
      [5.1120,52.0905],[5.1115,52.0928],[5.1130,52.0948],[5.1190,52.0955],
      [5.1250,52.0945],[5.1280,52.0910],[5.1260,52.0875],[5.1180,52.0870],
      [5.1120,52.0905]
    ]]
  }'::jsonb)
);
