# retail-inventory-tracker
A phone-first field app to capture retail audits: login, create/view submissions, attach two photos, share/download entries, and admin grouping.

## Stack
- Expo (React Native)
- Supabase (Auth, Postgres, Storage, RLS)

## Quickstart
1) In Supabase, copy the **Project URL** and **anon public key** from **Settings → API** for this project (do **not** use the service-role key, access token, or credentials from another workspace).
2) In `apps/mobile/`, copy `.env.example` → `.env` and set:
   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key-from-settings-api>
   ```
   When running EAS builds, define the same two variables in `apps/mobile/eas.json` → `build.*.env` (already wired up) via the Expo dashboard. These are the **only** Supabase secrets the mobile app needs.
3) Run `npx expo start --tunnel`. Metro prints a line like `"[Supabase] Runtime env check { url: 'https://prhhlv…', anonKey: 'eyJhbGc…W5c' }"`. If either value says `undefined`, fix your `.env` / EAS env before trying to sign in.
4) `npm run ios` / `npx expo start --tunnel` and scan with Expo Go or install the dev client.
