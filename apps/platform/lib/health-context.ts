import type { HealthContext, StoreConfigV2 } from "@scheniders/shared";
import {
    resolveTenantPhone,
    resolveTenantWhatsapp,
} from "@scheniders/sections/helpers/whatsapp";

/** The tenant-row fields the storefront falls back to for contact numbers. */
export interface TenantContactFields {
    store_config: unknown;
    contact_phone: string | null;
}

/**
 * The WhatsApp and call numbers the storefront will actually show for this
 * config, resolved with the storefront's own helpers. The health checks need
 * them because older stores keep their numbers in Settings/signup fields
 * outside `StoreConfigV2`; reading the config alone flagged numbers the store
 * was already showing.
 */
export function healthContextFor(
    tenant: TenantContactFields,
    config: Pick<StoreConfigV2, "commerce">,
): HealthContext {
    const like = {
        store_config: tenant.store_config,
        contact_phone: tenant.contact_phone,
        store_config_v2: { commerce: config.commerce },
    };
    const seo = (tenant.store_config as { seo?: { og_image_url?: unknown } } | null)?.seo;
    return {
        whatsapp: resolveTenantWhatsapp(like),
        phone: resolveTenantPhone(like),
        // The storefront falls back to the legacy SEO share image
        // (storeOgImage), so it counts as set.
        ogImage: typeof seo?.og_image_url === "string" ? seo.og_image_url : null,
    };
}
