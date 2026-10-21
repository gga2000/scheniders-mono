// =====================================================================
// toSectionTenant — the tenant sections are allowed to see
// =====================================================================
// Every section (and every helper a section calls) reads the tenant
// through `ctx.tenant`. With `RenderSection` on the server, that `ctx`
// is serialised into the RSC payload for each client section, so the
// storefront must NOT hand sections its full tenant row: `store_config_v2`
// alone is the whole page/section tree (~55 kB for a real store) and
// `store_config_v2_draft` doubles it. This helper copies exactly the
// fields sections read — the list below IS the contract; add a field here
// (and to `SectionTenant`) before reading it in a section.
//
// Fields and who reads them:
//   id                      newsletter_inline, product_reviews, site_footer,
//                           checkout_form, pdp_direct_order, order_tracker
//   business_name           site_header, site_footer, brand_story
//   branding.logo_url       site_header, site_footer
//   contact_phone           cart_summary, checkout_form, helpers/whatsapp
//   store_config.contact.{whatsapp_number,phone_number}
//                           helpers/whatsapp (every WhatsApp / call CTA)
//   store_config_v2.commerce
//                           cart_summary, checkout_form, checkout_order_summary,
//                           pdp_direct_order, product_bundles (delivery fees,
//                           discounts, bundles), order_tracker
//                           (order_status_narratives), helpers/whatsapp
//                           (commerce.whatsapp_number: first choice for every
//                           WhatsApp CTA, last fallback for call CTAs)
//   store_config_v2.enabled_locales
//                           helpers/locale-switch (site_header locale switch)
//   slug, plan, status, settings, contact_email, city
//                           not read by any section today; kept because they
//                           are scalars on `BaseTenant` (a few bytes) and the
//                           editor's product/category pickers type against it.
// =====================================================================

import type { SectionTenant } from "../types";

export function toSectionTenant(tenant: SectionTenant): SectionTenant {
  const contact = tenant.store_config?.contact;
  const v2 = tenant.store_config_v2;
  return {
    id: tenant.id,
    business_name: tenant.business_name,
    slug: tenant.slug,
    plan: tenant.plan,
    status: tenant.status,
    branding: { logo_url: tenant.branding?.logo_url ?? null },
    settings: tenant.settings,
    contact_email: tenant.contact_email ?? null,
    contact_phone: tenant.contact_phone ?? null,
    city: tenant.city ?? null,
    store_config: contact
      ? {
          contact: {
            whatsapp_number: contact.whatsapp_number ?? null,
            phone_number: contact.phone_number ?? null,
          },
        }
      : null,
    store_config_v2: v2
      ? {
          commerce: v2.commerce,
          enabled_locales: v2.enabled_locales,
        }
      : null,
  };
}
