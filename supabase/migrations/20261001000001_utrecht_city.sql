-- COP-62: Utrecht-rij voor `cities` (stadspakket/boeken) — AGENT-VOORSTEL, nog niet bevestigd.
--
-- Status quo (anders dan Düsseldorf/COP-57): voor Utrecht bestond nog geen enkele rode lijn of
-- POI-lijst, van Erik of uit een eerder plan-document. utrecht.md zegt: "Dev maakt het in
-- week 2-4 als data in de tabel cities; Erik loopt de rode lijn in week 5 en keurt goed." Deze
-- migratie is dus bewust het "dev maakt een eerste versie"-deel, niet het "Erik heeft 'm al
-- geaccepteerd"-deel.
--
-- red_line hieronder is een AGENT-SCHATTING op basis van publieke kaartbronnen (zie de
-- voorstel-tekst in de issue voor bronnen per bezienswaardigheid): een ruime lus binnen de
-- Utrechtse singels, rond de 10 bezienswaardigheden in 20261001000002, met de westgrens net
-- ten oosten van Utrecht Centraal/Hoog Catharijne (spoor, geen doorgang - veiligheid.md).
-- NIET zelf geverifieerd te voet. Dit mag NOOIT naar 'active' voordat Erik 'm zelf geloopt en
-- bevestigd heeft (zelfde regel als AGENTS.md "nooit"-regel en de aanpak in COP-57).
--
-- status = 'draft': de RLS-policy op `cities` laat alleen status = 'active' zien aan de
-- publieke /boeken-pagina, dus dit is onzichtbaar voor bezoekers. create_game(..., p_city_slug)
-- (COP-3) accepteert wel niet-archived steden, dus staff kan hiermee al een testspel draaien
-- via het beheerscherm (COP-6) om de rode lijn te lopen - dat is precies hoe Erik 'm in week 5
-- kan beoordelen. Zet pas op 'active' met:
--   update cities set status = 'active' where slug = 'utrecht';

insert into cities (slug, name, theme, status, red_line)
values (
  'utrecht',
  'Utrecht',
  'Politie & Proosttocht',
  'draft',
  private.geog('{
    "type": "Polygon",
    "coordinates": [[
      [5.1120,52.0905],[5.1115,52.0928],[5.1130,52.0948],[5.1190,52.0955],
      [5.1250,52.0945],[5.1280,52.0910],[5.1260,52.0875],[5.1180,52.0870],
      [5.1120,52.0905]
    ]]
  }'::jsonb)
);
