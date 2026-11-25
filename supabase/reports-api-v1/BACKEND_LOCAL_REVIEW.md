# Backend integration proposal — LOCAL ONLY

**Database migration approval is required before applying or deploying anything.**
No team IDs have been authorized. This proposal inserts no credentials, mappings,
or scope values and performs no production operations. Existing author credentials
remain author-only: the new whitelist column defaults to NULL and their author
UUIDs are untouched.

## Migration and rollout boundary

New migration: `20261103040000_reports_backend_integration.sql`, following the
existing `20261103030000_reports_integration_v1.sql`.

- Exactly one scope: author UUID OR a nonempty one-dimensional UUID team whitelist.
  NULL/empty/NULL-element whitelists cannot authorize access. The API additionally
  rejects duplicates or malformed credential rows, failing closed.
- Integration credentials remain server-only. The API never derives team scope
  from user input or from the key owner's current memberships.
- Product INSERT/UPDATE/DELETE touches the parent report. Reparenting touches both
  parents. Shared timestamp triggers use a monotonic clock, including multiple
  writes inside a single transaction.
- Cursor-supporting author/team indexes cover timestamp + UUID ordering.
- An invoker RPC and author-RLS retry receipts provide atomic report/product writes.

The Edge Function now requires the new credential column. Do not deploy it against
an unmigrated database. Review and test the migration first; after approval, apply
it before deploying the API. Team authorization and credential provisioning are
separate, explicitly approved future operations—not part of this change.

The local schema is not a complete live baseline: `schema.sql` lacks some fields
already used by the existing API/mobile writer (notably status and photos 3–6).
The RPC uses those existing application fields explicitly, without inventing
additional domain columns. Before migration approval, verify the target schema's
column types, defaults, required columns, triggers, grants and RLS against these
local assumptions. Legacy `user_id` input may equal the authenticated user and
`group_id` may only be NULL; neither is used as an ownership authority or inserted
as a database column because neither is in the local submissions schema.

## Read API contract

Existing response names remain: `api_version`, `generated_at`, `integration`,
`filters`, `count`, `has_more`, `next_since`, and `reports`, including existing nested
report fields. `filters.submitter_id` is the author UUID for author keys, NULL for
team keys; new `filters.team_ids` is the approved whitelist or NULL.
Each report's `submitted_by` comes from **that report's created_by**, not the key
owner. A deleted auth user retains their original UUID with NULL metadata.

`submitted_since` / `since` and `changed_since` remain **inclusive** and may be used
together (AND). Timestamp inputs require an explicit timezone; PostgreSQL
microsecond precision is preserved. Sort is ascending `(created_at,id)` or
`(updated_at,id)` when changed_since is present.

New `next_cursor` is a signed, opaque-to-clients continuation token, NULL on the
last page. On the next request, retain the exact same original since/changed_since
filters and provide `cursor=<next_cursor>` (URL encoded). Do **not** replace the
original filters with `next_since` while following a cursor. Limit may change.
Tokens bind the credential ID, authorized scope, and filters, and are invalidated
by signing-key rotation or scope changes. Tokens are integrity-protected, not
encrypted; they contain no raw API credential. Timestamp/UUID validation precedes
PostgREST expression interpolation. Invalid cursors return 400.

`next_since` is retained for compatibility, not gap-free pagination: clients should
use `next_cursor` for page traversal, then use inclusive watermarks and deduplicate
report IDs/last_changed_at for polling. Pagination is keyset-based, not a frozen
snapshot: concurrent edits can move reports forward and cause repeat delivery.
Changes moving a report out of submitted status, hard deletions, and deleted
product rows are not delivered as tombstones; a changed submitted report contains
its current full product list.

## Frontend coordination: submit_report_v1

After migration approval/application, authenticated clients can use:

```ts
const { data: reportId, error } = await supabase.rpc('submit_report_v1', {
  p_report: report, // one report object; stable client-generated UUID in id
  p_products: products, // full [{ product, quantity, expiry_date, sort_order? }]
});
```

- Returns the report UUID. SECURITY INVOKER; EXECUTE granted to authenticated only,
  not PUBLIC/anon/service_role; underlying table RLS still applies.
- Report `id`, `team_id`, `date`, and required database domain fields must be
  supplied. `created_by`/legacy `user_id` can be omitted or equal auth.uid(). Status
  can be omitted (submitted) or submitted. `created_at` and `updated_at` are forbidden
  inputs; new created_at uses the database default. Unknown fields are rejected.
- Product IDs/submission IDs are server-assigned; only product, quantity,
  expiry_date, sort_order are accepted. Maximum 200 rows. An empty array is valid.
- Report and full product replacement share the RPC transaction. Invalid products
  roll back report, products, timestamps and retry receipt. RLS is not bypassed.
- The RPC explicitly checks report ownership, including for team admins, and never
  replaces another author's products. Existing owned reports may be submitted once
  through this RPC; their created_at is preserved. The client must submit a complete
  report object, not a partial patch.
- The first successful request binds `(auth.uid(), report.id)` to its entire JSONB
  payload. Retry with the **same UUID and exact logical JSON payload/product array**.
  An identical retry returns the same report UUID without rewriting products or
  advancing timestamps. A different payload under that same ID is rejected (22023).
  This is an idempotent submission endpoint, not a general-purpose edit endpoint.
- Retain the successful/uncertain payload locally. Upload photos first to stable
  report-specific paths, then call the RPC with successful paths. Do not fall back
  to separate parent/product writes if an RPC result is uncertain; retry the RPC.
- Retry receipts are durable and author-RLS protected. Do not prune them without
  choosing/documenting a retry retention policy. They are not an audit log or a
  security boundary against an author altering their own data via direct table API.

## Validation

Executed locally with Node v22.19.0, no network or database writes:

```text
node --test supabase/reports-api-v1/pagination.test.mjs supabase/reports-api-v1/api.local-test.mjs
12 passed, 0 failed
node --check supabase/reports-api-v1/functions/index.ts
```

The handler tests use the real TypeScript handler (Node's built-in stripping) and
an in-memory Supabase double. They verify author/team filtering, requested-scope
rejection, actual author identity, response names, equal-timestamp cursor pages,
inclusive timestamps and changed-scope rejection. Helper tests cover token binding,
tampering, malformed/oversized tokens, precision and injection payloads.

`rpc.local-test.sql` was also executed through `pglite.local-test.mjs` against
an in-memory embedded PostgreSQL with an approximate schema and RLS fixture.
Both migrations applied; RPC/ownership/idempotency/product-change tests passed,
and fixture rollback was verified. This caught and fixed a PL/pgSQL block-label
qualification error in the new RPC before deployment. It is not proof of live
schema compatibility, actual PostgREST behavior, or concurrent-session safety.
PGlite 0.5.17 was installed outside the repository at `D:\Temp\rws-db-check`.
Run the embedded test with `PGLITE_MODULE` set to its module file URL.

The same SQL suite can be run with psql against a fuller disposable database. It requires a
disposable database named `helios_reports_test_v1` with current application schema,
policies and both integration migrations already applied; otherwise it refuses to
run. It rolls back fixtures and tests scope constraints, anonymous denial, retry
stability, rollback on invalid products, all product-change triggers, author spoofing,
and cross-author admin denial. Run using psql with ON_ERROR_STOP. Full target-schema PostgreSQL/RLS
execution, concurrent-session retry/ID-race tests, Deno type checking, actual
PostgREST handling, and a full target-schema review remain required before approval.

Local blockers: psql and Deno unavailable; Docker installed but daemon unavailable.
No dependencies were added to the application's package files. Final repository
whitespace and frontend validation are tracked separately in the HTML report.
