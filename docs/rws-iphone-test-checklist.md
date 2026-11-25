# RWS iPhone test gate — November 25, 2026 UTC

## Verified without production changes

- Local app: `apps/mobile`; Expo account `al96`; SDK 54 / React Native 0.81.5.
- Supabase organization: Pro, spend cap enabled. No plan change needed for a small pilot.
- All-project cycle Nov 5–Dec 5: storage **2.947 GB average / 100 GB**, uncached egress **0.313 / 250 GB**, cached **0.028 / 250 GB**, functions **28,733 / 2 million**. These are cycle readings, not a current retained-byte inventory or future guarantee.
- Expo Doctor: 18/18 after SDK 54 patch/dependency fixes.
- Dev-client EAS profile parses correctly: internal distribution, development client, development environment.
- One enabled iPhone exists in EAS device registration. Its identity has NOT been matched to Alberto's current phone. Do not publish its identifier.
- Latest listed finished iOS production build was Nov 3; that does not prove App Store Connect processing, tester availability, or installation.
- 16 backend tests, 12 product/queue/retry tests, embedded PostgreSQL fixtures, web export and iOS Hermes export pass. A JS export is not an Xcode/native build.
- Repository-wide TypeScript still has existing errors. npm reports 37 advisories including one critical; triage is outstanding, not a clean public-release bill of health. Do not run `npm audit fix --force` blindly.

## Production gate

Do not ship the updated form before its RPC exists. Dry run lists only:

1. `20261103040000_reports_backend_integration.sql`
2. `20261103050000_report_write_integrity.sql`

Neither has been applied. The second adds author/path integrity checks to direct authenticated writes; review against legacy triggers and grants, including older clients. Obtain explicit approval for production database changes, preserve a rollback plan, and prefer a staging clone. No team-scoped credential until the exact allowlist is approved.

## Register the phone if needed (Windows CMD)

```cmd
cd /d C:\Users\alroc\retail-inventory-tracker-actual\apps\mobile
npx eas-cli@latest device:create
```

Choose the existing Alberto Apple team and website registration; open the displayed registration link/QR on the test iPhone in Safari. This is development-device registration, not a change to TestFlight testers or the user's RWS login. If this is already the registered phone, no new registration is needed.

## Development build, after registration and build/archive review

```cmd
npx eas-cli@latest build --platform ios --profile devclient
```

Review signing/device prompts; use existing valid credentials. Do not revoke certificates, buy a plan, or overwrite another app. Verify available EAS credits/pricing before starting; Supabase Pro does not include EAS build credits. Inspect the upload archive so generated exports, diagnostics, signed log URLs, private handoff documents and environment secrets do not travel unnecessarily.

Install the resulting development build on the registered iPhone. Enable iOS Developer Mode if required. Then start Metro:

```cmd
npx expo start --dev-client --tunnel
```

Open the development-client QR/link on the phone. Do not use Expo Go for native acceptance: it cannot include the custom spreadsheet module. Use authorized test data; current fallback config points at the live backend unless explicitly replaced for staging. No service-role key belongs in the client.

## Acceptance checklist

- Existing login and password recovery still work; no password/tester resets.
- Required brand; store number preserves leading zeros; quantity 0/decimals; leap/invalid dates.
- Correct team and author; switching accounts never restores another account's draft.
- Submit report plus products atomically; confirm in Reports and in the database.
- Six real photos remain visible in details, PDF and native XLSX. Check labels, expiry text, memory and share sheet on the physical phone.
- Airplane-mode draft retained; no-photo queue syncs when form is active; raw local photo URIs are not falsely called backed up.
- Simulate lost RPC response: retry uses the same frozen report ID, product payload and durable paths, without reupload/duplicate report. Restore action recovers original frozen values after edits.
- Force export failure after database save: retry export without a new report; refreshed signed links never change RPC identity.
- Verify legacy report reads and each supported export. Unsupported fallbacks must reject extended data explicitly, never silently drop it.
- Team API security/pagination and external key delivery are separate release gates.

## Not implemented or performed

No 12/20-photo release, relational photo migration, public-to-private bucket switch, compression rollout, production migration, updated function/web deployment, new native cloud build, store submission, paid upgrade, key delivery or account reset. The public submissions bucket remains a documented privacy issue. Keep the six-photo cap until every producer/consumer supports the expansion.

After acceptance: build/submit a fresh TestFlight binary with the existing account/tester setup. TestFlight builds expire after 90 days; an OTA JavaScript update cannot renew an expired beta. App Store distribution is the longer-term way to avoid the recurring beta-expiration deadline.
