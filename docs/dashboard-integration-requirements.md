# RWS dashboard integration — Will's confirmed requirements

## Confirmed by Will

- Consumer builds against the documented v1 API names; no sample reader required.
- Scope must cover the RWS team's submitted reports, not only Austin as author.
- Backfill starts September 1, 2026. Confirm business timezone for the boundary;
  current example requests use `2026-09-01T00:00:00Z`.
- Poll every 15 minutes, server-side with a dedicated integration key.
- Timestamp filters are inclusive. Consumer deduplicates by report ID.
- USD pricing; priority 1 urgent, 2 yellow, 3 OK.
- Product rows need product name, numeric quantity, and expiry date. Separate
  quantity units are unnecessary; the receiving system knows product units.
- Starter required brand choices: Richlands, Billy Pie, Ninja Kombucha.
  Will will confirm the full list with Austin.
- Store number is the chain's own number (e.g. Kroger 532); store it as text
  to preserve leading zeros and any chain-specific formatting.
- Consumer downloads photos at fetch time; one-hour signed links are acceptable.
- Deletion events are not required for v1.
- Compatibility policy accepted: stable v1 names; advance notice and versioning
  for breaking changes.
- Key must be delivered through a private channel, not chat, Git, an HTML
  handoff, or a browser bundle. Consumer will store it in server settings.
- Will will send the first request details for coordinated verification.
  Request details/logs must redact credentials and signed photo tokens.

## Blocking scope clarification — live read-only inspection

Supabase project: `prhhlvdoplavakbgcbes`.
Counts below are submitted rows with `created_at >= 2026-09-01T00:00:00Z`
as observed during inspection; these are not permanent totals.

| Team | ID | Submitted reports | Authors / relevant memberships |
| --- | --- | ---: | --- |
| Admin Team for rwsretailservice | 064a1ead-7edd-4751-ab04-907393dbd0ce | 133 | Austin 29; Shawn 47; Travis 54; Twoaas 3 |
| LONE OAK COFFEE FIELD TEAM | d25b7573-4b4e-4f53-ba1e-2d8019ac701c | 4 | Shawn 4; Beth, Austin and others are members |
| Lone Oak | c9d40d6c-9ce6-4ce2-bf89-5b8c3f17ce1a | 0 | Beth, Austin, Will and LoneOakCoffee are members |

Ask Alberto to confirm the authorized team ID or explicit set of team IDs.
Do not infer report visibility from a submitter's current memberships, and do
not grant all reports by every member across unrelated teams. Filter each
report by its stored `team_id` against the key's server-side allowed scope.
No production access scope or credentials were changed in this inspection.

## Implementation changes required after scope confirmation

1. Add an explicit server-side team scope to integration credentials, while
   preserving existing author-scoped credentials until deliberately retired.
2. Issue a distinct team-scoped key; do not silently broaden the existing key.
3. Apply team filtering before pagination, product lookups, or signing photos.
4. Resolve each report's actual submitter; the current author-only API loads
   one profile and must not label every team report as Austin.
5. Preserve existing v1 report names. Scope metadata can be added explicitly;
   do not misrepresent a team as `filters.submitter_id`.
6. Verify unauthorized requests fail and non-allowed team data never leaks.
7. Backfill from the agreed September boundary and check all pages and authors.
8. Arrange private credential delivery separately. Do not assume the assistant
   has sent an email or a private message to Will.

## Sync caveats to address

- Inclusive timestamp polling with ID deduplication handles ordinary overlap,
  but a timestamp-only cursor can stall when a full page has the same timestamp.
  Add deterministic timestamp-plus-ID pagination before relying on full backfill.
- If updates should refresh existing dashboard records, deduplicate by
  `(id, last_changed_at)` or upsert by ID, rather than ignoring every seen ID
  forever. `changed_since` is appropriate for edits, `submitted_since` for
  new submissions; choosing only submitted_since will miss edits to old rows.
- The newly introduced `updated_at` value cannot reconstruct historical edits.
  Product-only edits must also advance the parent report's change timestamp.
- The existing direct-submit form uses `created_at` as submitted time; v1 has no
  separately tracked status-transition timestamp.
- Photo downloading needs retries before URLs expire; refresh through the API
  rather than persisting signed URLs as permanent identifiers.

## Local implementation update — November 22, 2026 UTC

The newer read-only aggregate audit found 158 submitted reports from the same
UTC September boundary: 153 in Admin Team for rwsretailservice, 4 in LONE OAK
COFFEE FIELD TEAM, and 1 in Lone Oak. The table above is the earlier snapshot,
not the current total. Exact team authorization is still unresolved.

Implemented locally (not deployed):
- Team allowlist credentials preserving existing author-only keys; per-report
  submitter attribution; signed timestamp-plus-ID continuation cursor.
- Product changes touch parent timestamps; atomic authenticated report/product
  RPC with stable-ID identical retries and author-scoped receipts.
- Required brand picker, visible store number/chain, validated product rows,
  native/web drafts and queue, and RPC-driven online/retry persistence.
- Detail views and web Excel/web-native PDF/iOS streaming spreadsheet include
  extended fields. Unsupported spreadsheet fallbacks fail explicitly.
- More than six photos are rejected by the local uploader, not truncated.

Validation: 12 backend tests, 9 product/queue tests, embedded PostgreSQL
migration/RPC/RLS fixtures, Expo web export (24 routes), and whitespace checks
passed. Production migration dry run would apply exactly the new backend
migration but applies nothing. Full TypeScript check still has existing errors
outside the modified integration files. Embedded fixtures are not live-schema
or concurrent-session proof; actual PostgREST/Deno/native E2E remain required.

No new key was issued, permissions broadened, schema applied, function/web
release deployed, app submitted, or paid plan purchased. Do not ship the form
before its new RPC migration exists remotely.

Photo audit: six fixed slots remain the supported cap. Average 3 photos/report;
109 recent files sampled from 30 reports averaged 2.35 MB. The submissions bucket
is public; signed URLs do not make those objects private. Private storage and
12/20-photo support require a separate compatible rollout and approval.

See `rws-integration-and-photo-report.html` for the mobile-friendly consolidated
report, official pricing references, interactive calculator, and reply draft.
