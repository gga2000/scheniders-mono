import { createBrowserClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { isNoConsoleAccess } from "./staff-sign-in";

let _client: ReturnType<typeof createBrowserClient> | null = null;

function getBrowserClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _client = createBrowserClient(url, key);
  return _client;
}

let leaving = false;

/** Reload once; the middleware then sends the page to the login page with the reason. */
function leave(): void {
  if (leaving) return;
  leaving = true;
  window.location.reload();
}

/**
 * After a failed API answer. When this browser no longer holds a session (the
 * console ended a sign-in past its age limit, or another tab signed out), the
 * page reloads and the middleware takes it to the login page with the reason;
 * otherwise staff meet "Could not load" lines and "?" badges on a page that can
 * never load again. A failure while a session is still held is the caller's to
 * show, so this never reloads in a loop.
 *
 * An out-of-date token whose refresh could not reach the auth server (a network
 * blip, a 502) answers no session with a retryable error, and the session stays
 * in the browser: "could not check" is not "signed out", so the page and what
 * was typed on it stay. A refused refresh drops the session, and the page leaves.
 */
export async function leaveIfSignedOut(): Promise<void> {
  if (leaving) return;
  const {
    data: { session },
    error,
  } = await getBrowserClient().auth.getSession();
  if (session || isAuthRetryableFetchError(error)) return;
  leave();
}

/**
 * Fetch wrapper that automatically attaches the Supabase session token
 * as an Authorization: Bearer header. Use this for all admin API routes
 * that call requireAdmin().
 */
export async function adminFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const supabase = getBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) void leaveIfSignedOut();
  // The login has no console access any more (its staff row was removed or
  // switched off): the session is still held, so only this mark says so.
  if (isNoConsoleAccess(response)) leave();
  return response;
}
