import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import {
  createSupabaseServerClient,
  createSupabasePublicClient,
  createSupabaseServiceClient,
} from "./supabase/server";
import { redactServerOnlyConfig } from "@scheniders/shared";
import type { Tables } from "@scheniders/supabase";
import type { Tenant } from "./types";
import { canPreviewDraft } from "./preview-access";

/** httpOnly cookie holding a preview token; set by /api/draft-view. */
export const DRAFT_VIEW_COOKIE = "sb_draft_view";

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
  if (!v2.error) return redactTenant((v2.data as Tenant | null) ?? null);

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
  return redactTenant((legacy.data as Tenant | null) ?? null);
}

/**
 * Strip server-only secrets (CAPI tokens) from the resolved tenant's config
 * BEFORE it reaches any client component. The storefront serializes the full
 * config into the section tree, so this is the single chokepoint that keeps
 * tokens out of the browser. The checkout server action fetches the tenant
 * separately (its own query) and therefore still sees the tokens for CAPI.
 */
function redactTenant(tenant: Tenant | null): Tenant | null {
  if (!tenant) return null;
  const t = tenant as Tenant & {
    store_config_v2?: unknown;
    store_config_v2_draft?: unknown;
  };
  return {
    ...t,
    store_config_v2: redactServerOnlyConfig(
      t.store_config_v2 as Parameters<typeof redactServerOnlyConfig>[0],
    ),
    store_config_v2_draft: redactServerOnlyConfig(
      t.store_config_v2_draft as Parameters<typeof redactServerOnlyConfig>[0],
    ),
  } as Tenant;
}

/**
 * Resolve a tenant from a subdomain slug.
 *
 * Cached per-request via React `cache` so multiple components in the same
 * request share the same DB call.
 */
const getPublishedTenantBySlug = (slug: string): Promise<Tenant | null> =>
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
  )();

/**
 * Draft view: a visitor holding a valid preview token for THIS tenant (in
 * the httpOnly `sb_draft_view` cookie, set by the token-gated
 * /api/draft-view route) sees the real storefront rendered from the
 * unpublished draft, published config as the fallback. The token is
 * re-verified on every request against the resolved tenant, so it expires
 * with the token and never opens another tenant's draft. Everyone else
 * gets the cached published tenant, unchanged.
 */
async function withDraftView(
  published: Tenant | null,
  loadWithDraft: () => Promise<Tenant | null>,
): Promise<Tenant | null> {
  if (!published) return published;
  const token = (await cookies()).get(DRAFT_VIEW_COOKIE)?.value;
  if (!canPreviewDraft(token, published.id)) return published;
  const withDraft = await loadWithDraft();
  if (!withDraft) return published;
  return {
    ...withDraft,
    store_config_v2: withDraft.store_config_v2_draft ?? withDraft.store_config_v2,
    store_config_v2_draft: null,
  };
}

export const getTenantBySlug = cache(
  async (slug: string): Promise<Tenant | null> =>
    withDraftView(await getPublishedTenantBySlug(slug), () =>
      getTenantForPreview(slug),
    ),
);

/**
 * Resolve tenant by custom domain (Tier 3+ feature).
 * Stub for now — will query a `tenant_domains` table later.
 */
const getPublishedTenantByCustomDomain = (domain: string): Promise<Tenant | null> =>
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
    )();

export const getTenantByCustomDomain = cache(
  async (domain: string): Promise<Tenant | null> =>
    withDraftView(await getPublishedTenantByCustomDomain(domain), () =>
      getTenantByCustomDomainForPreview(domain),
    ),
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
  // Service role, NOT the anon client. `anon_revoke_tenant_draft`
  // (2026-08-17) revoked anon's column privilege on
  // `store_config_v2_draft` so an unpublished store cannot be scraped —
  // which left this resolver asking for a column its own client may not
  // read, and every preview died on "42501 permission denied for table
  // tenants". The route is token-gated (HMAC, and the token's tenant_id
  // must match the resolved tenant), so reading the draft with elevated
  // rights here is the intended design, not a shortcut.
  // Cross-version cast (see ServerClientLike) — same runtime API.
  const supabase =
    createSupabaseServiceClient() as unknown as ServerClientLike;
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
    // Service role for the same reason as `getTenantForPreview`.
    // Cross-version cast (see ServerClientLike) — same runtime API.
    const supabase =
      createSupabaseServiceClient() as unknown as ServerClientLike;
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
