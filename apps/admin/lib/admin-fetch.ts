import { createBrowserClient } from "@supabase/ssr";

let _client: ReturnType<typeof createBrowserClient> | null = null;

function getBrowserClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _client = createBrowserClient(url, key);
  return _client;
}

let leaving = false;

/**
 * After a failed API answer. When this browser no longer holds a session (the
 * console ended a sign-in past its age limit, or another tab signed out), the
 * page reloads and the middleware takes it to the login page with the reason;
 * otherwise staff meet "Could not load" lines and "?" badges on a page that can
 * never load again. A failure while a session is still held is the caller's to
 * show, so this never reloads in a loop.
 */
export async function leaveIfSignedOut(): Promise<void> {
  if (leaving) return;
  const {
    data: { session },
  } = await getBrowserClient().auth.getSession();
  if (session || leaving) return;
  leaving = true;
  window.location.reload();
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
  return response;
}
