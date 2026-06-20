import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabasePublicClient,
} from "./supabase/server";
import type { Tables } from "@scheniders/supabase";
import type { Tenant } from "./types";

/**
 * EC29: how long a PUBLIC storefront read is served from Next's data cache
 * before a single request re-fetches it. Caps DB load to ~1 fetch per tenant
 * per window during a viral spike (instead of one round-trip per request);
 * merchant publishes appear within this window. The token-gated PREVIEW path
 * stays uncached so the editor always sees fresh draft state.
 */
const STOREFRONT_CACHE_SECONDS = 60;

/** Columns shared between legacy + v2-aware queries. */
const BASE_TENANT_COLS =
  "id, business_name, slug, plan, status, branding, settings, store_config, contact_email, contact_phone, address, city";

/**
 * Public storefront column set: v2 published config, never the draft.
 * Anonymous visitors must not receive unpublished merchant changes.
 */
export const PUBLIC_TENANT_COLS = `${BASE_TENANT_COLS}, store_config_v2`;

/**
 * Preview-only column set: includes the draft so the editor can render
 * unpublished changes. Only used by the token-gated preview route.
 */
export const PREVIEW_TENANT_COLS = `${BASE_TENANT_COLS}, store_config_v2, store_config_v2_draft`;

/**
 * Both storefront clients are the same runtime Supabase API, but @supabase/ssr
 * bundles a different @supabase/supabase-js version than the one installed
 * directly, so their `SupabaseClient` generics don't unify. `selectTenant` is
 * typed for the SSR client; the cached path casts its public client to this.
 */
type ServerClientLike = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function selectTenant(
  supabase: ServerClientLike,
  filter: { kind: "slug"; value: string } | { kind: "id"; value: string },
  opts?: { includeDraft?: boolean },
): Promise<Tenant | null> {
  const primaryCols = opts?.includeDraft ? PREVIEW_TENANT_COLS : PUBLIC_TENANT_COLS;

  const apply = (cols: string) =>
    filter.kind === "slug"
      ? supabase.from("tenants").select(cols).eq("slug", filter.value).maybeSingle()
      : supabase.from("tenants").select(cols).eq("id", filter.value).maybeSingle();

  // Try with v2 columns first.
  const v2 = await apply(primaryCols);
  if (!v2.error) return (v2.data as Tenant | null) ?? null;

  // Fallback: legacy schema (v2 columns not yet migrated).
  // Postgres error 42703 = "column does not exist".
  const code = (v2.error as { code?: string } | null)?.code;
  if (code !== "42703") {
    console.error("[tenant] resolution error:", v2.error);
    return null;
  }
  const legacy = await apply(BASE_TENANT_COLS);
  if (legacy.error) {
    console.error("[tenant] legacy resolution error:", legacy.error);
    return null;
  }
  return (legacy.data as Tenant | null) ?? null;
}

/**
 * Resolve a tenant from a subdomain slug.
 *
 * Cached per-request via React `cache` so multiple components in the same
 * request share the same DB call.
 */
export const getTenantBySlug = cache((slug: string): Promise<Tenant | null> =>
  // React `cache` dedupes within a request; `unstable_cache` persists ACROSS
  // requests (the EC29 win). The callback uses the cookie-free public client so
  // it's safe inside unstable_cache. Tagged for future on-demand revalidation
  // (a platform→storefront publish webhook); a 60s TTL bounds staleness today.
  unstable_cache(
    async (): Promise<Tenant | null> => {
      if (!slug) return null;
      // Cross-version cast (see ServerClientLike) — same runtime API.
      const supabase = createSupabasePublicClient() as unknown as ServerClientLike;
      return selectTenant(supabase, { kind: "slug", value: slug });
    },
    ["storefront-tenant-slug", slug],
    {
      revalidate: STOREFRONT_CACHE_SECONDS,
      tags: ["storefront-tenant", `storefront-tenant-${slug}`],
    },
  )(),
);

/**
 * Resolve tenant by custom domain (Tier 3+ feature).
 * Stub for now — will query a `tenant_domains` table later.
 */
export const getTenantByCustomDomain = cache(
  (domain: string): Promise<Tenant | null> =>
    unstable_cache(
      async (): Promise<Tenant | null> => {
        if (!domain) return null;
        // Cross-version cast (see ServerClientLike) — same runtime API.
        const supabase =
          createSupabasePublicClient() as unknown as ServerClientLike;
        const { data } = await supabase
          .from("tenant_domains")
          .select("tenant_id")
          .eq("domain", domain)
          .eq("verified", true)
          .maybeSingle()
          .then((r) => ({
            ...r,
            data: r.data as Pick<Tables<"tenant_domains">, "tenant_id"> | null,
          }));

        if (!data?.tenant_id) return null;
        return selectTenant(supabase, { kind: "id", value: data.tenant_id });
      },
      ["storefront-tenant-domain", domain],
      {
        revalidate: STOREFRONT_CACHE_SECONDS,
        tags: ["storefront-tenant", `storefront-tenant-domain-${domain}`],
      },
    )(),
);

/**
 * Resolve a tenant for the token-gated editor preview route.
 *
 * Unlike `getTenantBySlug`, this includes `store_config_v2_draft` so the
 * editor can render unpublished changes. Call this ONLY from the preview
 * route — never from public storefront routes.
 */
export const getTenantForPreview = cache(async (slug: string): Promise<Tenant | null> => {
  if (!slug) return null;
  const supabase = await createSupabaseServerClient();
  return selectTenant(supabase, { kind: "slug", value: slug }, { includeDraft: true });
});

/**
 * Resolve a tenant by custom domain for the token-gated editor preview route.
 * Like `getTenantByCustomDomain` but includes `store_config_v2_draft` so the
 * editor renders unpublished changes when previewing via a custom-domain URL.
 * Preview only — never call from public storefront routes.
 */
export const getTenantByCustomDomainForPreview = cache(
  async (domain: string): Promise<Tenant | null> => {
    if (!domain) return null;
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("tenant_domains")
      .select("tenant_id")
      .eq("domain", domain)
      .eq("verified", true)
      .maybeSingle()
      .then(r => ({ ...r, data: r.data as Pick<Tables<"tenant_domains">, "tenant_id"> | null }));

    if (!data?.tenant_id) return null;
    return selectTenant(supabase, { kind: "id", value: data.tenant_id }, { includeDraft: true });
  },
);
