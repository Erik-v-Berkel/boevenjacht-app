-- Alleen voor de lokale testdatabase (npx supabase db reset). Niet in productie gebruiken.
insert into private.app_secrets (key, value)
values ('admin_code', extensions.crypt('test-admin', extensions.gen_salt('bf')))
on conflict (key) do update set value = excluded.value;
