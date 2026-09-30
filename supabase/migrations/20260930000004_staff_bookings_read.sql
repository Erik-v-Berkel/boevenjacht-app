-- Staff-leestoegang tot boekingen: fundament voor het beheerscherm (COP-6, week 4:
-- "Lijst spellen, eindtijd aanpassen, foto afkeuren, spel stoppen. Klaar als: geen SQL
-- meer nodig.").
--
-- Er is bewust geen publieke zelfregistratie (COP-47/AGENTS.md regel 1). Staff-accounts
-- worden buiten de app om aangemaakt (Supabase-dashboard/uitnodiging door Erik), dus elke
-- authenticated gebruiker is staff. Klanten/spelers loggen nooit in: checkout blijft
-- anoniem (COP-46) en zij krijgen straks een join-link per e-mail (COP-5), geen account.
--
-- Schrijven (eindtijd aanpassen, foto afkeuren, spel stoppen) is geen onderdeel van dit
-- fundament en krijgt bij COP-6 eigen, auditbare RPC's — niet direct table-access.
create policy "staff leest boekingen" on bookings
  for select
  to authenticated
  using (true);
