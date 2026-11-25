// Dependency-free helpers shared by the Edge Function and local Node tests.
export class RequestError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export function parseTimestamp(value, name) {
  if (value === null) return null;
  if (!TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new RequestError(`${name} must be an ISO-8601 timestamp.`);
  }
  // Retain Postgres microseconds: rounding to milliseconds loses rows at ties.
  return value;
}
export function credentialScope(credential) {
  const author = credential.scope_user_id;
  const teams = credential.scope_team_ids;
  if (UUID.test(author || '') && teams === null) return { author, teams: null };
  if (author === null && Array.isArray(teams) && teams.length > 0 &&
      teams.every((id) => typeof id === 'string' && UUID.test(id)) &&
      new Set(teams).size === teams.length) {
    return { author: null, teams: [...teams].sort() };
  }
  throw new Error('Invalid integration credential scope.');
}
const encoder = new TextEncoder();
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new RequestError('Invalid cursor.');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}
async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function encodeCursor(position, binding, secret) {
  const payload = encoder.encode(JSON.stringify({ v: 1, ...position, binding }));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), payload);
  return `${base64url(payload)}.${base64url(new Uint8Array(signature))}`;
}
export async function decodeCursor(token, binding, secret) {
  try {
    if (token.length > 4096) throw new Error();
    const parts = token.split('.');
    if (parts.length !== 2) throw new Error();
    const payload = decode(parts[0]);
    if (!await crypto.subtle.verify('HMAC', await signingKey(secret), decode(parts[1]), payload)) throw new Error();
    const value = JSON.parse(new TextDecoder().decode(payload));
    if (value.v !== 1 || value.binding !== binding || !UUID.test(value.id)) throw new Error();
    parseTimestamp(value.timestamp, 'cursor timestamp');
    // Validation occurs before either value is interpolated into PostgREST.
    return { id: value.id, timestamp: value.timestamp };
  } catch {
    throw new RequestError('Invalid cursor or cursor filters/scope have changed.');
  }
}
export function afterCursor(column, cursor) {
  if (!['created_at', 'updated_at'].includes(column) || !UUID.test(cursor.id)) throw new RequestError('Invalid cursor.');
  parseTimestamp(cursor.timestamp, 'cursor timestamp');
  return `${column}.gt.${cursor.timestamp},and(${column}.eq.${cursor.timestamp},id.gt.${cursor.id})`;
}
