import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@scheniders/supabase";
import { cookies } from "next/headers";

/**
 * Every storefront Supabase request gives up after this long. Without it a
 * stalled connection to the API (a 522/504 under load) held each page and
 * beacon open until Vercel killed the function at 300 s, so a short database
 * slowdown piled up into an outage. A timed-out read fails like any other
 * query error: the caller's existing error path runs and the page answers.
 */
const SUPABASE_REQUEST_TIMEOUT_MS = 8_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Server-side Supabase client (anon key).
 *
 * Reads tenant data via RLS-allowed public views/queries.
 * Storefront is fully public — no auth required for reading published products.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignore — called from a Server Component
          }
        },
      },
    },
  );
}

/**
 * Service role client — bypasses RLS.
 * Use only in trusted server code (e.g., creating orders from checkout).
 */
import { createClient } from "@supabase/supabase-js";

export function createSupabaseServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: fetchWithTimeout },
    },
  );
}

/**
 * EC29: cookie-FREE anon client for PUBLIC, cacheable storefront reads
 * (published tenant config, visible products/categories). Because it never
 * touches `cookies()` it can run inside `unstable_cache` (which executes
 * outside the request scope and throws if cookies are read). It uses the anon
 * key, so RLS confines it to exactly what an anonymous visitor may see — the
 * same role anonymous storefront traffic already hits, just without the
 * per-request cookie wiring, so cross-request caching becomes possible.
 */
export function createSupabasePublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: fetchWithTimeout },
    },
  );
}
