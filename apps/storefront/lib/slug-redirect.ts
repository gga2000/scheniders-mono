// =====================================================================
// Old-slug → current-slug resolution (handle claim, UX2-13 follow-up)
// =====================================================================
// When a merchant renames their handle, links already shared on WhatsApp
// keep working: a miss on `tenants.slug` falls back to
// `tenant_slug_history` (old_slug → tenant_id) and the caller redirects
// to the tenant's CURRENT slug. Chains (a→b→c) collapse automatically
// because history stores the tenant id, not the next slug.
//
// Fail-soft by design: if the history table doesn't exist yet (migration
// pending) or the lookup errors, we return null and the caller 404s
// exactly as before.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createSupabasePublicClient } from "./supabase/server";

// Mirrors tenant.ts STOREFRONT_CACHE_SECONDS (not exported there):
// bounded staleness for public reads.
const CACHE_SECONDS = 60;

/** Loose query surface — `tenant_slug_history` isn't in the generated
 * DB types until the migration is applied + types regenerated. */
interface LooseClient {
    from(table: string): {
        select(cols: string): {
            eq(
                col: string,
                v: string,
            ): {
                maybeSingle(): Promise<{ data: Record<string, unknown> | null }>;
            };
        };
    };
}

export const resolveRenamedSlug = cache(
    (oldSlug: string): Promise<string | null> =>
        unstable_cache(
            async (): Promise<string | null> => {
                if (!oldSlug) return null;
                try {
                    const supabase =
                        createSupabasePublicClient() as unknown as LooseClient;
                    const { data: hist } = await supabase
                        .from("tenant_slug_history")
                        .select("tenant_id")
                        .eq("old_slug", oldSlug)
                        .maybeSingle();
                    const tenantId = hist?.tenant_id;
                    if (typeof tenantId !== "string") return null;
                    const { data: tenant } = await supabase
                        .from("tenants")
                        .select("slug")
                        .eq("id", tenantId)
                        .maybeSingle();
                    const slug = tenant?.slug;
                    return typeof slug === "string" ? slug : null;
                } catch {
                    return null;
                }
            },
            ["storefront-slug-rename", oldSlug],
            { revalidate: CACHE_SECONDS },
        )(),
);
