export type AuthEmailFlow = 'invite' | 'magiclink' | 'recovery' | 'signup';

const PRODUCTION_WEB_URL =
  'https://albertoroca96.github.io/retail-inventory-tracker';

// Returns "/retail-inventory-tracker" on your Pages site, "" elsewhere (localhost, native)
export function webBasePath(): string {
  if (
    typeof window === 'undefined' ||
    typeof window.location === 'undefined' ||
    typeof window.location.pathname !== 'string'
  ) {
    return '';
  }
  // For a path like "/retail-inventory-tracker/..." grab the first segment
  const m = window.location.pathname.match(/^\/[^/]+/);
  return m ? m[0] : '';
}

export function webAuthCallbackUrl(flow: AuthEmailFlow): string {
  const webBase =
    typeof window !== 'undefined' &&
    typeof window.location !== 'undefined' &&
    typeof window.location.origin === 'string'
      ? `${window.location.origin}${webBasePath()}`
      : PRODUCTION_WEB_URL;

  const callback = new URL(`${webBase}/auth/callback`);
  callback.searchParams.set('flow', flow);
  return callback.toString();
}
