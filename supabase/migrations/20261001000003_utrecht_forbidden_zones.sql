-- COP-62: Utrecht verboden zone voor `city_forbidden_zones` — AGENT-VOORSTEL, ruwe schets.
--
-- Utrecht Centraal + Hoog Catharijne (spoor, drukke doorgangen/roltrappen) ligt direct ten
-- westen van de rode lijn (20261001000001). Nog geen spellogica leest deze tabel (zie
-- 20260930000006_city_driven_game.sql, "vervolgwerk COP-3"), dus dit heeft nu geen effect op
-- een lopend spel - het legt alvast vast wat Erik bij het lopen van de rode lijn moet
-- vermijden/uitsluiten. Coördinaten zijn een ruwe schets, niet zelf ter plekke geverifieerd.

insert into city_forbidden_zones (city_id, label, kind, area)
select c.id, 'Utrecht Centraal & Hoog Catharijne (spoor)', 'spoor',
       private.geog('{
         "type": "Polygon",
         "coordinates": [[
           [5.1050,52.0885],[5.1115,52.0885],[5.1115,52.0940],[5.1050,52.0940],[5.1050,52.0885]
         ]]
       }'::jsonb)
  from cities c
 where c.slug = 'utrecht';
