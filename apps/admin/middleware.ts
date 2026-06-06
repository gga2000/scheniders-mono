import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_ROLES = new Set(["super_admin", "support_staff"]);

export async function middleware(request: NextRequest) {
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
  const isAuthApi = path.startsWith("/api/auth");
  const isHealthApi = path === "/api/health";
  const isApi = path.startsWith("/api/");

  // Public surfaces — bypass auth checks entirely.
  if (isAuthApi || isHealthApi) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated:
  //  - APIs → 401 JSON (so fetch/XHR sees the error, not an HTML redirect).
  //  - Pages → redirect to /login (except /login itself).
  if (!user) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (isLoginPage) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated — verify admin-console access via the dedicated `admin_users`
  // table (decoupled from the main app's user_profiles.role). The
  // `admin_users_read_own` RLS policy lets the user read their own row via the
  // anon-authed client.
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("admin_role, is_active")
    .eq("user_id", user.id)
    .single();

  const isAdmin =
    !!adminRow?.admin_role && adminRow.is_active === true && ALLOWED_ROLES.has(adminRow.admin_role);

  if (!isAdmin) {
    if (isApi) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isLoginPage) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "forbidden");
    return NextResponse.redirect(url);
  }

  // Signed-in admin landing on /login — bounce to dashboard.
  if (isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
