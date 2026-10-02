-- COP-66: Erik gaf op een kaartje aan dat het Königsallee-gebied te smal is — het dekt nu
-- vrijwel alleen de Kö-Graben (het water/park in het midden), terwijl beide rijbanen
-- (Königsallee Ost en West, elk aan weerszijden van de Graben) ook in het gebied moeten vallen.
-- De lijn zelf (sinds 20261001000006) ligt al correct in het midden; alleen de straal was te
-- krap. Königsallee is op zijn breedst gevelrij-tot-gevelrij ca. 85-90 m; 90 m vanaf de
-- middellijn dekt daarmee ruim beide straten. Zelfde aanpak als 20261001000006: sjabloon
-- bijwerken en bestaande spellen meenemen.
update private.sight_templates
   set radius_m = 90
 where id = 5;

update public.sights as s
   set radius_m = t.radius_m
  from private.sight_templates as t
 where s.sort = t.id
   and t.id = 5
   and s.radius_m is distinct from t.radius_m;
