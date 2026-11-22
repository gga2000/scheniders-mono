import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isCredentialRejection } from "@/lib/admin-auth-error";
import {
  NO_ACCESS_HEADERS,
  NO_CONSOLE_ACCESS,
  SIGN_IN_ENDED,
  SIGNED_OUT,
  bearerToken,
  signInEnded,
  verifyStaffToken,
} from "@/lib/staff-sign-in";
import { CROSS_SITE_WRITE, isOwnPageWrite } from "@/lib/same-origin";
import { NEXT_PAGE, pageAfterSignIn } from "@/lib/page-after-sign-in";
import { plainPath } from "@/lib/plain-path";
import { sentryEnvironment } from "@scheniders/shared/sentry-scrub";
import { CSP_HEADER, REPORT_GROUP, breachReportUrl, newNonce, scriptPolicy } from "@/lib/csp";

const ALLOWED_ROLES = new Set(["super_admin", "support_staff"]);

/** Staff whose access could not be checked: the database or auth server did not answer. */
const CHECK_FAILED = "Could not check your access. Try again in a moment.";

/**
 * Set when the console ends a sign-in past its age limit, and cleared by the
 * next signed-in request. An open page learns of the end from an API answer
 * and reloads; by then the session is gone, so without this mark the login
 * page could not say why staff are there.
 */
const SIGN_IN_ENDED_MARK = "staff_sign_in_ended";

/**
 * Every answer carries the script policy with a nonce of its own (lib/csp.ts).
 * The request carries it on to Next.js, which puts the nonce on its scripts,
 * and to the root layout as x-nonce; a nonce the browser sent is replaced.
 */
export async function middleware(request: NextRequest) {
  const nonce = newNonce();
  const reportUrl = breachReportUrl(process.env.NEXT_PUBLIC_SENTRY_DSN, sentryEnvironment(process.env.VERCEL_ENV));
  const policy = scriptPolicy(nonce, { development: process.env.NODE_ENV === "development", reportUrl });
  request.headers.set("x-nonce", nonce);
  request.headers.set(CSP_HEADER, policy);
  const response = await checkAccess(request);
  response.headers.set(CSP_HEADER, policy);
  if (reportUrl) response.headers.set("Reporting-Endpoints", `${REPORT_GROUP}="${reportUrl}"`);
  // Staff answers (phones, emails, wallets) stay out of the browser's disk
  // cache, where they would outlast a sign-out on a shared computer.
  if (request.nextUrl.pathname.startsWith("/api/")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function checkAccess(request: NextRequest) {
  // An encoded letter or slash in the path: the plain path first, so every
  // check below reads the address the way Next.js will (lib/plain-path.ts).
  // The address stays on the console: only its path changes.
  const plain = plainPath(request.nextUrl.pathname);
  if (plain !== request.nextUrl.pathname) {
    const url = request.nextUrl.clone();
    url.pathname = plain;
    return NextResponse.redirect(url, 308);
  }

  // A write to the API must come from the console's own pages, before the
  // sign-in cookie it carries is read at all.
  if (request.nextUrl.pathname.startsWith("/api/") && !isOwnPageWrite(request.method, request.headers, request.nextUrl.host)) {
    return NextResponse.json({ error: CROSS_SITE_WRITE }, { status: 403 });
  }

  // Vercel's scheduler calls the scheduled checks with no staff session. Each
  // checks the scheduler's secret itself and fails closed (lib/cron-auth.ts);
  // only a read that carries a bearer token gets that far.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return request.method === "GET" && bearerToken(request.headers)
      ? NextResponse.next({ request })
      : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const path = request.nextUrl.pathname;
  // Only the login page itself. A typo of it (/loginx, /login/help) has no
  // page: passed through signed out, it drew the console's not-found page,
  // whose shell read got a 401 and reloaded the page, over and over.
  const isLoginPage = path === "/login";
  const isApi = path.startsWith("/api/");

  // A refreshed session arrives as cookies on supabaseResponse; every other
  // answer must carry them too, or the browser keeps a spent refresh token.
  const withSession = (response: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };
  // The login page gets the reason, and the page staff asked for: signing in
  // takes them back to it (lib/page-after-sign-in.ts). The asked-for page's own
  // query goes inside `next`, not onto the login page's address.
  const toLogin = (error?: "forbidden" | "expired") => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const reason = error ?? (request.cookies.has(SIGN_IN_ENDED_MARK) ? "expired" : undefined);
    if (reason) url.searchParams.set("error", reason);
    const asked = request.nextUrl.pathname + request.nextUrl.search;
    if (pageAfterSignIn(asked) !== "/") url.searchParams.set(NEXT_PAGE, asked);
    return withSession(NextResponse.redirect(url));
  };
  // An API request with no sign-in behind it. After a sign-in that reached its
  // age limit (the mark below), staff read that; otherwise that they are
  // signed out. Either way a form's save says why, not "Unauthorized".
  const signedOut = (words: string = request.cookies.has(SIGN_IN_ENDED_MARK) ? SIGN_IN_ENDED : SIGNED_OUT) =>
    withSession(NextResponse.json({ error: words }, { status: 401 }));
  // The check itself failed: say so and keep the staff member signed in,
  // instead of reading an outage as "signed out" or "forbidden". The edge
  // Sentry turns console.error into an event, so an outage of the console's
  // front door reaches the alerts, not only the staff who meet it.
  // The event keeps the answer's status and the error's code: an answer with
  // an empty body has no message, and a timeout, a lost grant and a bad key
  // read the same without them (round 19, SCHENIDERS-1N).
  const checkFailed = (stage: "sign-in" | "staff row", error: unknown, status?: number) => {
    console.error("[middleware] Access check failed", {
      stage,
      path,
      status: status ?? errorField(error, "status"),
      code: errorField(error, "code"),
      message: errorMessage(error),
    });
    if (isLoginPage) return supabaseResponse;
    const headers = { "retry-after": "5", "cache-control": "no-store" };
    if (isApi) return withSession(NextResponse.json({ error: CHECK_FAILED }, { status: 503, headers }));
    return withSession(
      new NextResponse(checkFailedPage(request.nextUrl.href), {
        status: 503,
        headers: { ...headers, "content-type": "text/html; charset=utf-8" },
      })
    );
  };

  // The session's own token, checked locally (lib/staff-sign-in.ts), names the
  // staff member, so their staff row is read while the auth server answers for
  // the session: one round trip to Supabase instead of two on every page and
  // API request. Reading the token first refreshes an expired session, as the
  // auth server's check did before. The row is read under the session's own
  // token and counts only once the auth server has answered for that same user.
  const tokenCheck = await startStaffCheck(supabase.auth).then(
    (checked) => ({ failed: false as const, checked }),
    (error: unknown) => ({ failed: true as const, error }),
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Unauthenticated:
  //  - APIs → 401 JSON (so fetch/XHR sees the error, not an HTML redirect).
  //  - Pages → redirect to /login (except /login itself).
  if (!user) {
    if (!isCredentialRejection(userError)) return checkFailed("sign-in", userError);
    if (isApi) return signedOut();
    if (isLoginPage) {
      return supabaseResponse;
    }
    return toLogin();
  }

  // The auth server has answered for this session; its token says when it
  // signed in. A sign-in past the staff age limit is ended for good, here and
  // on the auth server, and staff sign in again; the login page shows why.
  if (tokenCheck.failed) return checkFailed("sign-in", tokenCheck.error);
  const { checked } = tokenCheck;
  if (!checked) {
    if (isApi) return signedOut();
    return isLoginPage ? supabaseResponse : toLogin();
  }
  const { session } = checked;
  if (signInEnded(session.signedInAt)) {
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) console.error("[middleware] Ending an old sign-in failed", { path, message: errorMessage(signOutError) });
    supabaseResponse.cookies.set(SIGN_IN_ENDED_MARK, "1", {
      path: "/",
      maxAge: 24 * 60 * 60,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    if (isApi) return signedOut(SIGN_IN_ENDED);
    return isLoginPage ? supabaseResponse : toLogin("expired");
  }
  if (request.cookies.has(SIGN_IN_ENDED_MARK)) supabaseResponse.cookies.delete(SIGN_IN_ENDED_MARK);

  // The API reads the browser's token from its Authorization header and checks
  // it only locally, so it must be the session the auth server just answered
  // for: a token of an ended session, or of someone else, is refused here.
  const sent = isApi ? bearerToken(request.headers) : null;
  if (sent) {
    let sentSession: Awaited<ReturnType<typeof verifyStaffToken>>;
    try {
      sentSession = await verifyStaffToken(supabase.auth, sent);
    } catch (error) {
      return checkFailed("sign-in", error);
    }
    if (sentSession?.sessionId !== session.sessionId) return signedOut(SIGNED_OUT);
  }

  // Authenticated — admin-console access comes from the dedicated `admin_users`
  // table (decoupled from the main app's user_profiles.role), read above. The
  // `admin_users_read_own` RLS policy lets the user read their own row via the
  // anon-authed client. No row is "no access"; a failed read is not. A row of
  // anyone but the user the auth server named is no access.
  const { data: adminRow, error: adminError, status: adminStatus } = await checked.staffRow;

  if (adminError) return checkFailed("staff row", adminError, adminStatus);

  const isAdmin =
    adminRow?.user_id === user.id &&
    !!adminRow.admin_role &&
    adminRow.is_active === true &&
    ALLOWED_ROLES.has(adminRow.admin_role);

  if (!isAdmin) {
    if (isApi) {
      return withSession(NextResponse.json({ error: NO_CONSOLE_ACCESS }, { status: 403, headers: NO_ACCESS_HEADERS }));
    }
    if (isLoginPage) {
      return supabaseResponse;
    }
    return toLogin("forbidden");
  }

  // Signed-in admin landing on /login: on to the page asked for, or Home,
  // without the login page's own reason.
  if (isLoginPage) {
    const target = pageAfterSignIn(request.nextUrl.searchParams.get(NEXT_PAGE));
    return withSession(NextResponse.redirect(new URL(target, request.nextUrl.origin)));
  }

  return supabaseResponse;
}

/**
 * Checks the session's own token locally and starts the read of that staff
 * member's row: null when the cookies hold no token that checks out.
 *
 * The row is read by a client of its own that sends that token. The cookie
 * client lets one call at a time use the session, and its call to the auth
 * server holds the session for the whole round trip, so a read through it
 * waited for that answer even when started first (speed audit round 1: the
 * live logs showed the two calls one after the other).
 */
async function startStaffCheck(auth: Pick<SupabaseClient["auth"], "getClaims" | "getSession">) {
  const session = await verifyStaffToken(auth);
  if (!session) return null;
  // The token just checked, read again from the cookies: no network.
  const { data } = await auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return null;
  const staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    accessToken: async () => accessToken,
  });
  return {
    session,
    // Promise.resolve sends the read now: a query is only sent once awaited.
    staffRow: Promise.resolve(
      staffClient.from("admin_users").select("user_id, admin_role, is_active").eq("user_id", session.userId).maybeSingle(),
    ),
  };
}

/** A status or code the error carries (an auth error has both, a database error a code). */
function errorField(error: unknown, field: "status" | "code"): string | number | undefined {
  if (typeof error !== "object" || error === null || !(field in error)) return undefined;
  const value: unknown = Reflect.get(error, field);
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

/** What went wrong, without the request or the session in it. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

/**
 * A plain page for a failed access check, with a link back to the page asked
 * for. The link is the whole address: a path such as "//x" alone would be
 * another site to the browser.
 */
function checkFailedPage(retryUrl: string): string {
  const href = retryUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Try again</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F7F7F5;color:#1E1E1E;font-family:system-ui,sans-serif"><main style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:20px;margin:0 0 8px">Could not check your access</h1><p style="font-size:14px;color:#6B6B6B;margin:0 0 20px">The server did not answer in time. Nothing was changed and you were not signed out.</p><a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:12px;background:#1E1E1E;color:#fff;text-decoration:none;font-size:14px">Try again</a></main></body></html>`;
}

// The console serves no images of its own (public/ holds only the alerts
// worker), so every other address, whatever it ends in, gets the access check
// and the script policy: /merchants/x.png is still the console. Each skipped
// address is matched whole (a folder with its slash, a file to its end):
// "/favicon.icox" or "/_vercelx" is a console address like any other.
export const config = {
  matcher: ["/((?!_next/static/|_next/image$|_vercel/|favicon\\.ico$|support-sw\\.js$).*)"],
};
