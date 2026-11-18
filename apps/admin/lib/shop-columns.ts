/**
 * The shop columns the staff console shows, named rather than "*". A shop row
 * also carries the store builder's pages (store_config, store_config_v2 and
 * their drafts) and metadata, often 100 KB or more per shop, which no console
 * screen reads: with "*" the Merchants list sent them for every shop on the page.
 */
export const SHOP_COLUMNS =
  "id, display_id, business_name, slug, plan, status, trial_ends_at, branding, settings, " +
  "contact_email, contact_phone, address, city, created_at, is_prospect, prospect_lead_id, restrictions";

/** The wallet numbers the list, its cards and the compare view show. */
export const SHOP_WALLET_COLUMNS = "balance_iqd, threshold_iqd, total_charged_iqd, total_topped_up_iqd";
