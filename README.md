<div style="font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';">

# retail-inventory-tracker
A phone-first field app to capture retail audits: login, create/view submissions, attach two photos, share/download entries, and admin grouping.

**Docs font note:** This README prefers the `Inter`/system-ui font stack for readability (GitHub may fall back depending on your setup).

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
   > Icon note: the latest RWS globe artwork that ships with builds lives at `apps/mobile/assets/logo.png` and is referenced by the Expo config + home screen.
3) Run `npx expo start --tunnel`. Metro prints a line like `"[Supabase] Runtime env check { url: 'https://prhhlv…', anonKey: 'eyJhbGc…W5c' }". If either value says `undefined`, fix your `.env` / EAS env before trying to sign in.
4) `npm run ios` / `npx expo start --tunnel` and scan with Expo Go or install the dev client.

## Testing real builds (Expo Go ≠ TestFlight)
Expo Go includes many native modules out of the box. TestFlight/standalone builds only contain the native code you explicitly install, so something that works in Expo Go can still crash the standalone app if a module is missing. To exercise the real binary locally:

1. Install the custom dev client dependencies once:
   ```bash
   npx expo install expo-dev-client
   ```
2. Build a development client that contains the same native modules as TestFlight:
   ```bash
   eas build --platform ios --profile devclient
   ```
3. Install that `.ipa` on your device (TestFlight or Apple Configurator) and open Metro with release settings:
   ```bash
   npx expo start --no-dev --minify --tunnel
   ```
4. Scan the QR with the dev client. This reproduces the production runtime and surfaces missing-module crashes before shipping.

If you ever add a library that requires native code (e.g., `react-native-gesture-handler`, `react-native-reanimated`, etc.), run `npx expo install <library>` and rebuild the dev client/TestFlight build so the native module is bundled.

</div>