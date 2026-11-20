# Duboard — Dubai classifieds (Telegram Mini App, RU/EN)

Everything happens inside the Mini App: browsing, posting, moderation. The bot only opens the app and sends notifications. No channel/group posting. No real estate category.

## Structure
- `supabase/schema.sql` — tables (users, listings, favorites, reports). Run in the Supabase SQL editor. Create a PUBLIC storage bucket `listings`.
- `server/` — Express API + grammY bot (validates Telegram initData, moderation, photo upload to Supabase Storage). Serves `web/dist`.
- `web/` — React Mini App (Vite), RU/EN interface, listing language flag, filters.

## Run
1. `@BotFather`: /newbot -> token. /newapp (or Bot Settings -> Menu Button) -> URL = your HTTPS domain.
2. Supabase: run schema.sql, create public bucket `listings`.
3. `cd web && npm i && npm run build`
4. `cd server && cp .env.example .env` (fill in), `npm i && npm start`
5. Host on any HTTPS server (Railway, Render, VPS). Telegram requires HTTPS.

## Moderation
Put moderator Telegram IDs in `ADMIN_IDS`. They get a "Moderation" tab and a bot message on every new listing.

## Notes
- Sellers need a Telegram @username (buyers contact via it).
- Listings are published only after approval.

## Deploy (Railway / Render)
Build command: `npm run build` — Start command: `npm start`
Set env vars from `server/.env.example` in the host's dashboard (BOT_TOKEN, SUPABASE_SERVICE_KEY, WEBAPP_URL = the host's https URL).
Supabase project `duboard` already has the schema and the `listings` bucket.

## v5: locations, "still relevant?", saved searches

- **Location is mandatory** when posting: emirate + area (list in `server/src/taxonomy.js` → `LOCATIONS`). The feed has a 📍 filter that is remembered on the device. Old listings without a location stay visible but do not match location filters.
- **Still relevant?** After 14 days the bot asks the seller (Still available / Sold / Remove). No answer for 4 more days → the listing is archived. Constants: `REMIND_DAYS`, `ARCHIVE_AFTER_REMIND_DAYS` in `server/src/index.js`. Runs hourly inside the server (one instance only).
- **Saved searches** 🔔: tap the bell in the feed when any filter/search/location is set; up to 5 per user; managed in My → Alerts. When a listing is approved, matching users get a bot message with an "Open listing" button.
- Existing database: run `supabase/migrations/002_locations_renewal_searches.sql`.
- Users must have started the bot (or allow it via the Telegram prompt) for notifications to arrive.
