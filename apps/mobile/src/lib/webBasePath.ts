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
