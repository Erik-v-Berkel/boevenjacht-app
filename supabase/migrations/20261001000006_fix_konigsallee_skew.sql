-- COP-64 vervolg: Erik zag op de kaart dat de Königsallee (Kö) lijn scheef loopt.
-- De opgeslagen punten liepen in lengtegraad af van 6.7797 naar 6.7783 terwijl de
-- straat in werkelijkheid vrijwel kaarsrecht noord-zuid loopt (lengtegraad ~6.7788,
-- geverifieerd tegen de OSM-wegdata van Königsallee). Vervangt het sjabloon en haalt
-- bestaande spellen bij via dezelfde aanpak als 20261001000005.
update private.sight_templates
   set geometry = '{"type":"LineString","coordinates":[[6.7790,51.2265],[6.7789,51.2238],[6.7788,51.2214],[6.7788,51.2195],[6.7789,51.2174]]}'::jsonb
 where id = 5;

update public.sights as s
   set geometry = t.geometry,
       radius_m = t.radius_m
  from private.sight_templates as t
 where s.sort = t.id
   and t.id = 5
   and (s.geometry is distinct from t.geometry or s.radius_m is distinct from t.radius_m);
