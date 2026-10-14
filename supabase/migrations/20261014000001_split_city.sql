-- COP-92: Split-rij voor `cities` (nieuwe stad).
--
-- Anders dan Utrecht (COP-62): de 4 hoekpunten van het speelgebied komen hier rechtstreeks van
-- Erik in de issue (geen agent-schatting uit publieke kaartbronnen):
--   NO Park Đardin/bushalte 43.5097,16.4411 · ZO Haven/Riva 43.5065,16.4428 ·
--   ZW Matejuška/Marjanvoet 43.5074,16.4326 · NW Marjan Uitkijkpunt/Varoš top 43.5092,16.4312
--
-- De rode lijn hieronder is NIET de kale 4-punts-vierhoek: twee van de 7 bezienswaardigheden uit
-- 20261014000002 (Busstation Pazar en Prva Vidilica/Marjan Uitkijkpunt — dat laatste is dezelfde
-- plek als de NW-hoek, maar met een net iets andere coördinaat) vallen net buiten die vierhoek.
-- submit_photo wijst een foto af als "buiten het speelveld" zodra het punt niet binnen play_area
-- valt, los van de bezienswaardigheid-straal (zie 20260924000001_bonus_photos.sql) — met de kale
-- vierhoek zou de bonus op die twee plekken dus nooit lukken. Daarom: de convex hull van de 4
-- hoekpunten + 7 bezienswaardigheden, met de twee bezienswaardigheid-hoekpunten 25 m naar buiten
-- geduwd (ruim binnen de foto-straal van 60 m) zodat ze niet precies op de rand liggen (GPS-ruis).
-- De 4 hoekpunten van Erik zijn ongewijzigd.
--
-- Dit is een AGENT-TOEVOEGING op Eriks coördinaten, geen geverifieerde looproute. Net als bij
-- Utrecht (COP-62) geldt: niet zelf ter plekke gelopen/gecontroleerd op drukke wegen, spoor of
-- water als doorgang (veiligheid.md) — met name het Riva-stuk (boulevard langs de haven) en
-- Matejuška (jachthaven) grenzen aan water en verdienen een check door Erik voor dit op
-- `active` gaat.
--
-- status = 'draft': in afwachting van Eriks bevestiging van de rode lijn (zie open vraag in de
-- issue-afsluiting) — bewust voorzichtiger dan Utrecht, waar Erik expliciet "zet maar vast op
-- active" zei. Hier heeft Erik dat (nog) niet gezegd.
--
-- theme is NOT NULL maar nergens in de issue expliciet benoemd; 'Romeinse Stad' is rechtstreeks
-- afgeleid van Eriks eigen omschrijving van bezienswaardigheid #1 ("Het Romeinse Hart"), geen
-- verzonnen marketingclaim. Open vraag aan Erik: andere naam/thema gewenst?

insert into cities (slug, name, theme, status, red_line)
values (
  'split',
  'Split',
  'Romeinse Stad',
  'draft',
  private.geog('{
    "type": "Polygon",
    "coordinates": [[
      [16.4411,43.5097],[16.442709,43.508508],[16.4428,43.5065],
      [16.4326,43.5074],[16.431093,43.50893],[16.4312,43.5092],
      [16.4411,43.5097]
    ]]
  }'::jsonb)
);
