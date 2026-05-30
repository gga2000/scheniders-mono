import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import type { Tables } from "@scheniders/supabase";
import type { Tenant } from "./types";

/** Columns shared between legacy + v2-aware queries. */
const BASE_TENANT_COLS =
  "id, business_name, slug, plan, status, branding, settings, store_config, contact_email, contact_phone, address, city";

/** Add v2 columns when the migration has been applied. The query gracefully
 *  falls back to the base set if those columns don't exist yet. */
const V2_TENANT_COLS = `${BASE_TENANT_COLS}, store_config_v2, store_config_v2_draft`;

async function selectTenant(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  filter: { kind: "slug"; value: string } | { kind: "id"; value: string },
): Promise<Tenant | null> {
  const apply = (cols: string) =>
    filter.kind === "slug"
      ? supabase.from("tenants").select(cols).eq("slug", filter.value).maybeSingle()
      : supabase.from("tenants").select(cols).eq("id", filter.value).maybeSingle();

  // Try with v2 columns first.
  const v2 = await apply(V2_TENANT_COLS);
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
export const getTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  if (!slug) return null;
  const supabase = await createSupabaseServerClient();
  return selectTenant(supabase, { kind: "slug", value: slug });
});

/**
 * Resolve tenant by custom domain (Tier 3+ feature).
 * Stub for now — will query a `tenant_domains` table later.
 */
export const getTenantByCustomDomain = cache(
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
    return selectTenant(supabase, { kind: "id", value: data.tenant_id });
  },
);
