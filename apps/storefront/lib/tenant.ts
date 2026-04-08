import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import type { Tables } from "@scheniders/supabase";
import type { Tenant } from "./types";

/**
 * Resolve a tenant from a subdomain slug.
 *
 * Cached per-request via React `cache` so multiple components in the same
 * request share the same DB call.
 */
export const getTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  if (!slug) return null;

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, business_name, slug, plan, status, branding, settings, store_config, contact_email, contact_phone, address, city",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[tenant] resolution error:", error);
    return null;
  }

  return data as Tenant;
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

    const { data: tenant } = await supabase
      .from("tenants")
      .select(
        "id, business_name, slug, plan, status, branding, settings, store_config, contact_email, contact_phone, address, city",
      )
      .eq("id", data.tenant_id)
      .maybeSingle();

    return (tenant as unknown as Tenant) ?? null;
  },
);
