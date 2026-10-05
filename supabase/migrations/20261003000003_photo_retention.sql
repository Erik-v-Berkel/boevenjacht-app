-- COP-74: plant een dagelijkse aanroep van de Edge Function "cleanup" (30-dagen-wipe van
-- foto's/oude spellen), zelfde patroon als de pushmeldingen en het noodmeldingen-webhook:
-- private.app_secrets met url+secret, net.http_post, en zonder configuratie doet dit niets
-- (zie README voor de eenmalige deploy-stappen, geen nieuwe betaalde dienst nodig — pg_cron en
-- pg_net horen standaard bij Supabase).

create extension if not exists pg_cron;

create function private.run_photo_retention()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from private.app_secrets where key = 'cleanup_url';
  select value into v_secret from private.app_secrets where key = 'cleanup_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cleanup-secret', v_secret)
  );
end;
$$;

-- cron.schedule werkt als upsert op de jobnaam: opnieuw draaien van deze migratie (bv. db
-- reset) maakt geen dubbele job aan, het vervangt 'm.
select cron.schedule('photo-retention-wipe', '17 3 * * *', 'select private.run_photo_retention();');
