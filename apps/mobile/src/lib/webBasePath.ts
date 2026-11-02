export type AuthEmailFlow = 'invite' | 'magiclink' | 'recovery' | 'signup';

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

export function webAuthCallbackUrl(flow: AuthEmailFlow): string | undefined {
  if (
    typeof window === 'undefined' ||
    typeof window.location === 'undefined' ||
    typeof window.location.origin !== 'string'
  ) {
    return undefined;
  }

  const callback = new URL(
    `${window.location.origin}${webBasePath()}/auth/callback`
  );
  callback.searchParams.set('flow', flow);
  return callback.toString();
}
