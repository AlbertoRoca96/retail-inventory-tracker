# xlsx-service

A tiny Node service that generates a submission XLSX (with embedded photos) **server-side**.

This exists because:
- Supabase Edge Functions can hit CPU/time limits when embedding images into Excel.
- On-device ExcelJS XLSX generation can crash iOS due to memory/watchdog.

## Endpoint

### `POST /submission-xlsx`

**Headers**
- `Authorization: Bearer <supabase_access_token>`
- `Content-Type: application/json`

**Body**
```json
{ "submission_id": "<uuid>" }
```

**Response**
- `200` with XLSX bytes (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)

## Auth / Access Control

- JWT is validated via `supabase.auth.getUser(token)` (service-role client)
- Access is allowed only when `team_members(team_id, user_id)` exists for the submission's `team_id`

## Environment

```bash
PORT=8787
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
# Optional: comma-separated
ALLOWED_ORIGINS=https://albertoroca96.github.io
```

## Local dev

```bash
cd apps/xlsx-service
npm install
npm run build
npm run start
```

(Yes, we build first. Keeping runtime simple is good.)
