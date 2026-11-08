// The store's pixel config WITH its server-only Conversions API keys, for the
// funnel-event route and the order's server Purchase. The keys live in the
// `tenant_capi_secrets` lockbox (RLS on, no policies: only the service role
// reads it), never in the store design. Reads go through the data cache
// (60 s, like the public tenant read) so a burst of ad traffic costs about
// one database read per store per minute, not one per event. Server-only:
// never import it from a client component (it reads with the service role).

import type { AnalyticsConfig, StoreConfigV2 } from "@scheniders/shared";
import { cachedRead } from "./cached-read";
import { createSupabaseServiceClient } from "./supabase/server";

const CAPI_CONFIG_CACHE_SECONDS = 60;

interface CapiKeys {
  meta_capi_token: string | null;
  tiktok_capi_token: string | null;
}

/** The store's send keys from the lockbox; null when none are saved. */
function capiKeys(tenantId: string): Promise<CapiKeys | null> {
  return cachedRead(
    ["storefront-capi-keys", tenantId],
    { revalidate: CAPI_CONFIG_CACHE_SECONDS, tags: ["storefront-tenant"] },
    async (health) => {
      const { data, error } = await createSupabaseServiceClient(health)
        .from("tenant_capi_secrets")
        .select("meta_capi_token, tiktok_capi_token")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        console.error("[capi] send key read failed:", error);
        return null;
      }
      return data;
    },
  );
}

/**
 * The pixel config with the lockbox keys put in. A key still sitting in an
 * old copy of the design is ignored: the lockbox is the only source.
 */
export async function withCapiKeys(
  base: AnalyticsConfig,
  tenantId: string,
): Promise<AnalyticsConfig> {
  const keys = await capiKeys(tenantId);
  const rest: AnalyticsConfig = { ...base };
  delete rest.meta_capi_token;
  delete rest.tiktok_capi_token;
  return {
    ...rest,
    ...(keys?.meta_capi_token ? { meta_capi_token: keys.meta_capi_token } : {}),
    ...(keys?.tiktok_capi_token ? { tiktok_capi_token: keys.tiktok_capi_token } : {}),
  };
}

/** Null for a store that is not live (trial / active) or has no pixel config. */
export async function liveStoreAnalytics(tenantId: string): Promise<AnalyticsConfig | null> {
  const base = await cachedRead(
    ["storefront-capi-config", tenantId],
    { revalidate: CAPI_CONFIG_CACHE_SECONDS, tags: ["storefront-tenant"] },
    async (health) => {
      const { data, error } = await createSupabaseServiceClient(health)
        .from("tenants")
        .select("store_config_v2")
        .eq("id", tenantId)
        .in("status", ["trial", "active"])
        .maybeSingle();
      if (error) {
        console.error("[capi] store config read failed:", error);
        return null;
      }
      const config = (data?.store_config_v2 ?? null) as StoreConfigV2 | null;
      return (config?.globals?.analytics_pixels?.base as AnalyticsConfig | undefined) ?? null;
    },
  );
  return base ? withCapiKeys(base, tenantId) : null;
}
