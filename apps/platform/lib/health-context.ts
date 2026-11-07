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
    return {
        whatsapp: resolveTenantWhatsapp(like),
        phone: resolveTenantPhone(like),
    };
}
