/**
 * Minimal column set for list/table/card views, read from `public.orders`.
 * Excludes detail-only fields to reduce payload size by ~25%.
 * findById still fetches all columns (*) from the view for the detail modal.
 *
 * Every name here must be a real `orders` column: PostgREST rejects the whole
 * query (400, blank orders page) on one unknown name. The contract is pinned by
 * order-columns.test.ts against a checked-in copy of the table's
 * columns.
 *
 * Never add the margin columns (product_cost, net_profit, waseet_*_price):
 * the TABLE does not mask them for non-admins — only the view does.
 *
 * `risk_data` is not a column; `withRiskData` (order-repository.ts) attaches it after the fetch.
 * `tenant_id` is here to key that lookup.
 */
export const LIST_COLUMNS = `
  id,
  tenant_id,
  created_at,
  updated_at,
  version,
  original_created_at,
  scheduled_date,
  order_id,
  customer_name,
  phone,
  secondary_phone,
  whatsapp_contact_slot,
  city,
  governorate_code,
  address_details,
  items,
  price,
  status,
  priority,
  payment_status,
  delivery_fee,
  discount_amount,
  is_return,
  original_order_id,
  is_archived,
  is_pinned,
  source,
  sequence_number,
  tag_color,
  notes,
  internal_notes,
  contact_count,
  last_contacted_at,
  rejection_reason,
  needs_attention,
  attention_reasons,
  last_status_changed_by_name,
  last_status_changed_by_avatar,
  last_followup_by_name,
  last_followup_by_avatar,
  last_followup_at,
  last_followup_type,
  delivered_at,
  completed_at,
  attribution,
  ad_channel,
  is_verified_customer
`.trim();

/** LIST_COLUMNS as names, for projecting a row that arrived with every column. */
export const LIST_COLUMN_NAMES: readonly string[] = LIST_COLUMNS.split(",").map((c) => c.trim());

/**
 * Keep only the LIST_COLUMNS keys of an `orders` row.
 *
 * Realtime delivers the WHOLE row (all 84 columns, margin included) to every
 * tenant member: realtime.apply_rls filters columns only by column privilege,
 * and `authenticated` holds SELECT on every `orders` column. Projecting the
 * payload keeps the list cache to the same shape a list fetch produces, so
 * margin values never land in a non-admin's client cache through realtime.
 */
export function pickListColumns(row: Record<string, unknown>): Record<string, unknown> {
    const picked: Record<string, unknown> = {};
    for (const name of LIST_COLUMN_NAMES) {
        if (name in row) picked[name] = row[name];
    }
    return picked;
}

/**
 * Columns needed to build an export file. The list view deliberately omits some
 * of these to keep the page payload down, but `lib/export-utils.ts` reads them:
 * without `validated_governorate_code` and `is_replacement` they arrive
 * `undefined`, so every export silently fell back to the raw governorate code
 * and marked replacement orders as NOT containing returned goods.
 */
export const EXPORT_COLUMNS = `
${LIST_COLUMNS},
  validated_governorate_code,
  is_replacement,
  delivery_order_id
`.trim();
