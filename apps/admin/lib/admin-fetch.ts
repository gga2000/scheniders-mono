import { createBrowserClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { NO_CONSOLE_ACCESS, isNoConsoleAccess } from "./staff-sign-in";

let _client: ReturnType<typeof createBrowserClient> | null = null;

function getBrowserClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _client = createBrowserClient(url, key);
  return _client;
}

/** Why a page tried to leave. */
type LeaveReason = "signed-out" | "no-access";

/** The notice of a page that stayed, under one id so a later one replaces it. */
const STAYED_NOTICE = "left-page-stayed";

let leaving = false;

/**
 * What a page that tried to leave says when staff chose to stay on it: why it
 * tried, and how to keep what they typed. A signed-out page can save again
 * once staff sign in, in a new tab so this one keeps the typing.
 *
 * Words only, with no button: the typing is often in a dialog (Add Lead),
 * which keeps clicks off the rest of the page, so a button here could not be
 * pressed, and a click outside the dialog would close it.
 */
function sayWhyStayed(reason: LeaveReason): void {
  if (reason === "no-access") {
    toast.error(NO_CONSOLE_ACCESS, {
      id: STAYED_NOTICE,
      duration: Infinity,
      description: "This page can no longer save. Copy what you typed before you leave it.",
    });
    return;
  }
  toast.warning("You are signed out.", {
    id: STAYED_NOTICE,
    duration: Infinity,
    description: "What you typed is still here. Sign in again in a new tab, then save it here.",
  });
}

/**
 * Reload once; the middleware then sends the page to the login page with the
 * reason. A page with unsaved typing asks first (useLeaveGuard), and staff may
 * stay. That page then says why it tried to leave: before, it said nothing,
 * and a save answered only "Unauthorized".
 */
function leave(reason: LeaveReason): void {
  if (leaving) return;
  leaving = true;
  // Added after the guards, which were added when the typing began, so it
  // runs after them: a refused leave means the browser is asking.
  window.addEventListener(
    "beforeunload",
    (event) => {
      if (event.defaultPrevented) sayWhyStayed(reason);
    },
    { once: true },
  );
  window.location.reload();
}

/** A page that stayed has a sign-in again: it can leave again later, and the notice goes. */
function signedInAgain(): void {
  leaving = false;
  toast.dismiss(STAYED_NOTICE);
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
  leave("signed-out");
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

  // Sent after the page tried to leave, so after staff chose to stay: an
  // answer that went through means they signed in again in another tab.
  const afterLeaving = leaving;
  const response = await fetch(input, { ...init, headers });
  if (afterLeaving && response.ok) signedInAgain();
  if (response.status === 401) void leaveIfSignedOut();
  // The login has no console access any more (its staff row was removed or
  // switched off): the session is still held, so only this mark says so.
  if (isNoConsoleAccess(response)) leave("no-access");
  return response;
}
