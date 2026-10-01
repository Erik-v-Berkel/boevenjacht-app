-- COP-64: spellen die zijn aangemaakt vóór 20260930000001_sight_coordinates.sql
-- hebben nog de oude (minder nauwkeurige) coördinaten in hun eigen kopie van
-- de bezienswaardigheden staan, omdat public.sights een kopie is die bij het
-- aanmaken van het spel wordt gemaakt en niet meevalt met latere updates aan
-- het sjabloon. Dit haalt bestaande spellen in lijn met het bijgewerkte
-- sjabloon (private.sight_templates). Rheinuferpromenade (4), Königsallee (5)
-- en Hofgarten (7) zijn ongewijzigd, dus die raakt deze update niet aan.
update public.sights as s
   set geometry = t.geometry,
       radius_m = t.radius_m
  from private.sight_templates as t
 where s.sort = t.id
   and (s.geometry is distinct from t.geometry or s.radius_m is distinct from t.radius_m);
