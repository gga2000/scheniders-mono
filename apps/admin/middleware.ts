import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCredentialRejection } from "@/lib/admin-auth-error";
import { CROSS_SITE_WRITE, isOwnPageWrite } from "@/lib/same-origin";
import { sentryEnvironment } from "@scheniders/shared/sentry-scrub";
import { CSP_HEADER, REPORT_GROUP, breachReportUrl, newNonce, scriptPolicy } from "@/lib/csp";

const ALLOWED_ROLES = new Set(["super_admin", "support_staff"]);

/** Staff whose access could not be checked: the database or auth server did not answer. */
const CHECK_FAILED = "Could not check your access. Try again in a moment.";

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
  // A write to the API must come from the console's own pages, before the
  // sign-in cookie it carries is read at all.
  if (request.nextUrl.pathname.startsWith("/api/") && !isOwnPageWrite(request.method, request.headers, request.nextUrl.host)) {
    return NextResponse.json({ error: CROSS_SITE_WRITE }, { status: 403 });
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
  const isLoginPage = path.startsWith("/login");
  const isApi = path.startsWith("/api/");

  // A refreshed session arrives as cookies on supabaseResponse; every other
  // answer must carry them too, or the browser keeps a spent refresh token.
  const withSession = (response: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };
  const toLogin = (error?: "forbidden") => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (error) url.searchParams.set("error", error);
    return withSession(NextResponse.redirect(url));
  };
  // The check itself failed: say so and keep the staff member signed in,
  // instead of reading an outage as "signed out" or "forbidden". The edge
  // Sentry turns console.error into an event, so an outage of the console's
  // front door reaches the alerts, not only the staff who meet it.
  const checkFailed = (stage: "sign-in" | "staff row", error: unknown) => {
    console.error("[middleware] Access check failed", { stage, path, message: errorMessage(error) });
    if (isLoginPage) return supabaseResponse;
    const headers = { "retry-after": "5", "cache-control": "no-store" };
    if (isApi) return withSession(NextResponse.json({ error: CHECK_FAILED }, { status: 503, headers }));
    return withSession(
      new NextResponse(checkFailedPage(request.nextUrl.pathname + request.nextUrl.search), {
        status: 503,
        headers: { ...headers, "content-type": "text/html; charset=utf-8" },
      })
    );
  };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Unauthenticated:
  //  - APIs → 401 JSON (so fetch/XHR sees the error, not an HTML redirect).
  //  - Pages → redirect to /login (except /login itself).
  if (!user) {
    if (!isCredentialRejection(userError)) return checkFailed("sign-in", userError);
    if (isApi) {
      return withSession(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    if (isLoginPage) {
      return supabaseResponse;
    }
    return toLogin();
  }

  // Authenticated — verify admin-console access via the dedicated `admin_users`
  // table (decoupled from the main app's user_profiles.role). The
  // `admin_users_read_own` RLS policy lets the user read their own row via the
  // anon-authed client. No row is "no access"; a failed read is not.
  const { data: adminRow, error: adminError } = await supabase
    .from("admin_users")
    .select("admin_role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) return checkFailed("staff row", adminError);

  const isAdmin =
    !!adminRow?.admin_role && adminRow.is_active === true && ALLOWED_ROLES.has(adminRow.admin_role);

  if (!isAdmin) {
    if (isApi) {
      return withSession(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    if (isLoginPage) {
      return supabaseResponse;
    }
    return toLogin("forbidden");
  }

  // Signed-in admin landing on /login — bounce to dashboard.
  if (isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return withSession(NextResponse.redirect(url));
  }

  return supabaseResponse;
}

/** What went wrong, without the request or the session in it. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

/** A plain page for a failed access check, with a link back to the page asked for. */
function checkFailedPage(retryPath: string): string {
  const href = retryPath.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
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
