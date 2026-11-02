/**
 * The margin columns. Only a tenant admin may read them, and only through
 * `v_orders_with_risk` (masked per row) or `public.order_margin(order_id)`.
 * Migration 20261021090000 removes them from `authenticated`'s SELECT grant on
 * `public.orders`; until it is applied the table hands them to any member, so
 * no select string in this app names them either way.
 */
export const ORDER_MARGIN_COLUMNS = [
    "product_cost",
    "item_unit_costs",
    "net_profit",
    "waseet_merchant_price",
    "waseet_company_price",
] as const;

/**
 * Every `public.orders` column except the margin columns: the full-row read.
 *
 * Use this wherever a read wants the whole row — never `select("*")` or a bare
 * `.select()` (PostgREST sends both as `select=*`). Once the margin columns
 * leave `authenticated`'s grant, a `*` read of `orders` is refused with 42501
 * for every signed-in caller, admins included (orders-select-guard.test.ts).
 *
 * It is a plain template literal (no `.trim()`), so its type is the literal
 * string and supabase-js types the rows as the `orders` Row minus the margin
 * columns; postgrest-js strips the whitespace before sending it.
 *
 * Adding a column to `orders` therefore takes three steps: the migration that
 * adds it also runs `GRANT SELECT (<col>) ON public.orders TO authenticated`,
 * the column is added here, and the checked-in table copy in
 * order-columns.test.ts is refreshed.
 */
export const ORDER_READ_COLUMNS = `
  id,
  created_at,
  updated_at,
  order_id,
  customer_name,
  phone,
  city,
  governorate_code,
  address_details,
  items,
  price,
  status,
  whatsapp_link,
  notes,
  rejection_reason,
  scheduled_date,
  priority,
  payment_status,
  delivery_fee,
  discount_amount,
  is_return,
  original_order_id,
  is_archived,
  secondary_phone,
  delivery_slot,
  source,
  sequence_number,
  delivered_at,
  cancelled_at,
  printed_at,
  print_count,
  last_batch_id,
  is_gift,
  tag_color,
  is_pinned,
  delivery_order_id,
  is_reviewed,
  reviewed_at,
  reviewed_by,
  is_verified_customer,
  contact_count,
  address_status,
  address_issues,
  validated_governorate_code,
  internal_notes,
  assigned_to,
  assigned_at,
  is_shop_order,
  risk_metadata,
  needs_attention,
  attention_reasons,
  original_created_at,
  last_contacted_at,
  last_status_changed_by_name,
  last_status_changed_by_avatar,
  is_test,
  delivery_note,
  is_replacement,
  delivery_company,
  waseet_qr_id,
  waseet_qr_link,
  waseet_status_id,
  waseet_status_text,
  waseet_submitted_at,
  waseet_invoice_id,
  completed_at,
  version,
  tenant_id,
  refund_status,
  refunded_at,
  delivered_source,
  reason_id,
  deleted_at,
  idempotency_key,
  waseet_submit_started_at,
  whatsapp_contact_slot,
  last_followup_by_name,
  last_followup_by_avatar,
  last_followup_at,
  last_followup_type,
  attribution,
  ad_channel,
  confirmation_dispatched_at,
  abandoned_cart_at,
  abandoned_cart_outcome,
  abandoned_cart_resolved_at,
  abandoned_cart_resolved_by_name,
  abandoned_cart_order_id,
  entered_by
`;

/** ORDER_READ_COLUMNS as names, for projecting a row before it is written back. */
export const ORDER_READ_COLUMN_NAMES: readonly string[] = ORDER_READ_COLUMNS.split(",").map((c) => c.trim());

/**
 * Keep only the ORDER_READ_COLUMNS keys of an `orders` row: what a restore may
 * upsert.
 *
 * Backups taken before migration 20261021090000 were read with `select("*")`,
 * so their rows carry the margin keys (null for a non-admin, but present).
 * PostgREST sends an upsert as `INSERT ... ON CONFLICT (id) DO UPDATE SET
 * col = EXCLUDED.col` over every key in the payload, and Postgres needs SELECT
 * on each column whose EXCLUDED value it reads. Once `authenticated` loses
 * SELECT on the margin columns, one margin key fails the whole upsert with
 * 42501, admins included. Keys that are not `orders` columns at all (old
 * client-side fields) would fail it with PGRST204, so they go too.
 */
export function pickOrderWriteColumns(row: Record<string, unknown>): Record<string, unknown> {
    const picked: Record<string, unknown> = {};
    for (const name of ORDER_READ_COLUMN_NAMES) {
        if (name in row) picked[name] = row[name];
    }
    return picked;
}

/**
 * Order rows per restoreOrdersAction call. Server Action bodies are capped at
 * 1 MB, so the backup and vault restores send their orders in batches.
 */
export const RESTORE_ORDERS_BATCH_SIZE = 200;

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
 * Never add the margin columns (ORDER_MARGIN_COLUMNS): only the view masks
 * them for non-admins.
 *
 * `risk_data` is not a column; `withRiskData` (order-repository.ts) attaches it after the fetch.
 * `tenant_id` is here to key that lookup.
 *
 * Every field a status-chip predicate reads (lib/orders/order-chips.ts,
 * CHIP_PREDICATE_FIELDS) must be here. Without `refund_status` and
 * `is_replacement` the Refunded, Refund pending and Completed chips — and the
 * lists they open — silently treated every row as "no refund, not a
 * replacement" (live 2026-10-18: Refunded 0 for 53 refunded orders).
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
  is_replacement,
  refund_status,
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
  is_verified_customer,
  abandoned_cart_at,
  abandoned_cart_outcome,
  abandoned_cart_resolved_at,
  abandoned_cart_resolved_by_name,
  abandoned_cart_order_id,
  entered_by,
  delivery_slot,
  is_gift,
  is_reviewed,
  reviewed_at,
  reviewed_by
`.trim();

/** LIST_COLUMNS as names, for projecting a row that arrived with every column. */
export const LIST_COLUMN_NAMES: readonly string[] = LIST_COLUMNS.split(",").map((c) => c.trim());

/**
 * Keep only the LIST_COLUMNS keys of an `orders` row.
 *
 * Realtime delivers every column the subscriber holds SELECT on:
 * realtime.apply_rls filters columns only by column privilege. Before migration
 * 20261021090000 that is the whole row, margin included; after it, everything
 * but ORDER_MARGIN_COLUMNS. Either way the payload is wider than a list row, so
 * projecting it keeps the list cache to the shape a list fetch produces, and
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
 * (`is_replacement` is now in LIST_COLUMNS itself, for the status chips.)
 */
export const EXPORT_COLUMNS = `
${LIST_COLUMNS},
  validated_governorate_code,
  delivery_order_id
`.trim();
