-- COP-57: Düsseldorf-rij voor `cities` (stadspakket/boeken).
--
-- red_line (rode lijn/speelgebied-grens) is door Erik zelf bevestigd in de issue-interactie
-- (Noord: Rijn bij Oberkasseler Brücke tot Kaiserstraße; Oost: langs Berliner Allee; Zuid: tot
-- voorbij MedienHafen; West: langs de Rijn terug) - dezelfde grens als private.default_play_area()
-- in 20260924000001_bonus_photos.sql, nu expliciet door Erik herbevestigd i.p.v. agent-gegist.
-- city_forbidden_zones blijft leeg: daar heeft Erik nog geen data voor gedeeld (en de Rijn is
-- hier al de rand van het speelgebied, geen doorsnijding zoals Utrecht Centraal/Hoog Catharijne).
--
-- status = 'active' op verzoek van Erik, die deze rij al rechtstreeks via de SQL-editor had
-- aangemaakt (zelfde insert als hieronder) zodat hij meteen in /boeken kon testen - deze
-- migratie legt dat alsnog vast in versiebeheer. `where not exists` maakt 'm veilig om te
-- draaien op een omgeving waar de rij al bestaat (prod) zonder een duplicaat te maken.
--
-- `theme` is alleen weergavetekst op de stadskaart (src/components/BookingWizard.tsx) - pas 'm
-- gerust aan, het is geen spellogica.

insert into cities (slug, name, theme, status, red_line)
select 'dusseldorf', 'Düsseldorf', 'Polizei & Kneipentocht', 'active',
       private.geog('{
         "type": "Polygon",
         "coordinates": [[
           [6.7700,51.2355],[6.7910,51.2345],[6.7910,51.2270],[6.7840,51.2245],[6.7835,51.2150],
           [6.7700,51.2120],[6.7560,51.2105],[6.7460,51.2125],[6.7460,51.2175],[6.7560,51.2200],
           [6.7640,51.2215],[6.7680,51.2250],[6.7690,51.2300],[6.7700,51.2355]
         ]]
       }'::jsonb)
 where not exists (select 1 from cities where slug = 'dusseldorf');
