/**
 * Query keys that can carry a secret or a one-time credential in a page URL
 * (preview tokens, OAuth codes, team invites). Web analytics must never store
 * them, so they are dropped before a page view leaves the browser.
 */
const SENSITIVE_QUERY_KEYS = ["token", "code", "invite", "access_token", "refresh_token"] as const;

/** Returns the URL with every sensitive query value removed. */
export function scrubAnalyticsUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  for (const key of SENSITIVE_QUERY_KEYS) url.searchParams.delete(key);
  url.hash = "";
  return url.toString();
}
