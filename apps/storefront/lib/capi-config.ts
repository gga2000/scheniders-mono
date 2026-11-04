// The store's pixel config WITH its server-only Conversions API token, for the
// funnel-event route. Read through the data cache (60 s, like the public
// tenant read) so a burst of ad traffic costs about one database read per
// store per minute, not one per event. Server-only: never import it from a
// client component (it reads with the service role).

import type { AnalyticsConfig, StoreConfigV2 } from "@scheniders/shared";
import { cachedRead } from "./cached-read";
import { createSupabaseServiceClient } from "./supabase/server";

const CAPI_CONFIG_CACHE_SECONDS = 60;

/** Null for a store that is not live (trial / active) or has no pixel config. */
export function liveStoreAnalytics(tenantId: string): Promise<AnalyticsConfig | null> {
  return cachedRead(
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
}
