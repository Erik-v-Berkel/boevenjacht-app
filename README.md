# Boevenjacht — app

PWA voor Boevenjacht: React + TypeScript + Vite + Tailwind, Supabase (EU: Postgres/PostGIS,
Storage, Realtime), Leaflet + Turf.js. Spelregels en tijdberekening zijn server-side (Postgres
RPC met row lock) — de client geeft alleen snelle feedback.

## Starten

```bash
npm install
cp .env.example .env.local   # vul de Supabase-projectwaarden in, nooit committen
npm run dev
```

## Scripts

- `npm run dev` — dev-server
- `npm run build` — typecheck + productiebuild (incl. PWA service worker)
- `npm test` — Vitest éénmalig
- `npm run test:watch` — Vitest in watch-mode
- `npm run lint` — Oxlint

## Database

Schema-wijzigingen alleen via `supabase/migrations/`. Het stadspakket-datamodel (steden,
verboden zones, bezienswaardigheden/kroegen) staat gedocumenteerd in
`docs/stadspakket-data-model.md`.

## Testen met nep-GPS en snelle klok

Geofences en tijdregels worden getest met `?dev=1` (nep-GPS) en een `time_scale`-parameter
voor een versnelde klok (nog te implementeren, zie backlogitems 3 en 10 in Paperclip).
