/**
 * Stores that are not customers stay out of every list, count and money
 * figure of the console: the demo store (Fermi B13, `is_demo`) and a prospect
 * store built for a lead before the lead signs up (`is_prospect`, made by
 * build-store and turned into a customer by convert_lead_atomic). Each has
 * its own way in: the demo card, and the lead's page.
 *
 * Pass to `.match()` on a `tenants` read, or the embedded form on a read that
 * joins `tenants!inner`.
 */
export const CUSTOMER_SHOP = { is_demo: false, is_prospect: false } as const;
export const CUSTOMER_SHOP_EMBEDDED = { "tenants.is_demo": false, "tenants.is_prospect": false } as const;
