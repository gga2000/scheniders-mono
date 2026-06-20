import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@scheniders/supabase";
import { cookies } from "next/headers";

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
    },
  );
}
