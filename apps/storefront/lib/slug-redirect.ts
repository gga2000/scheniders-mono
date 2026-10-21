// =====================================================================
// Old-slug → current-slug resolution (handle claim, UX2-13 follow-up)
// =====================================================================
// When a merchant renames their handle, links already shared on WhatsApp
// keep working: a miss on `tenants.slug` falls back to
// `tenant_slug_history` (old_slug → tenant_id) and the caller redirects
// to the tenant's CURRENT slug. Chains (a→b→c) collapse automatically
// because history stores the tenant id, not the next slug.
//
// Both reads run as anon: `public_slug_history_read` exposes the history
// table, and `public_storefront_read` only admits trial/active tenants, so
// a renamed store that is suspended or cancelled resolves to null and the
// old link 404s like any other unshowable store.
//
// A failed lookup is logged and resolves to null, the same contract the
// tenant lookup itself follows (lib/tenant.ts selectTenant): the caller
// then 404s.
// =====================================================================

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createSupabasePublicClient } from "./supabase/server";

// Mirrors tenant.ts STOREFRONT_CACHE_SECONDS (not exported there):
// bounded staleness for public reads.
const CACHE_SECONDS = 60;

type PublicClient = ReturnType<typeof createSupabasePublicClient>;

/** The current slug of the tenant that used to own `oldSlug`, or null. */
export async function lookupRenamedSlug(
  supabase: PublicClient,
  oldSlug: string,
): Promise<string | null> {
  if (!oldSlug) return null;

  const history = await supabase
    .from("tenant_slug_history")
    .select("tenant_id")
    .eq("old_slug", oldSlug)
    .maybeSingle();
  if (history.error) {
    console.error("[slug-redirect] history lookup failed:", history.error);
    return null;
  }
  if (!history.data) return null;

  const tenant = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", history.data.tenant_id)
    .maybeSingle();
  if (tenant.error) {
    console.error("[slug-redirect] current-slug lookup failed:", tenant.error);
    return null;
  }
  const current = tenant.data?.slug ?? null;
  // A history row that points back at its own slug would redirect in a loop.
  return current && current !== oldSlug ? current : null;
}

export const resolveRenamedSlug = cache(
  (oldSlug: string): Promise<string | null> =>
    unstable_cache(
      () => lookupRenamedSlug(createSupabasePublicClient(), oldSlug),
      ["storefront-slug-rename", oldSlug],
      { revalidate: CACHE_SECONDS },
    )(),
);
