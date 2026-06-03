#!/usr/bin/env python3
"""
Read /tmp/scheniders-history.json (output of transform-historical-csv.py),
generate batched SQL files ready to apply via mcp__supabase__execute_sql.

Each batch is a single INSERT ... SELECT ... FROM jsonb_array_elements(...)
that's small enough to fit in one MCP call (~50 rows / ~80KB per batch).

product_id is resolved at INSERT time by joining items[0].name against
public.products (scoped to the same tenant). If the product isn't found,
the row still inserts with product_id = NULL inside items[].

Output:
  /tmp/scheniders-history-batches/00-pre-import.sql   (disable triggers)
  /tmp/scheniders-history-batches/01-insert-NNN.sql   (one per batch)
  /tmp/scheniders-history-batches/99-post-import.sql  (re-enable triggers)
  /tmp/scheniders-history-batches/MANIFEST.md
"""
from __future__ import annotations

import json
from pathlib import Path

IN_JSON = Path("/tmp/scheniders-history.json")
OUT_DIR = Path("/tmp/scheniders-history-batches")
BATCH_SIZE = 50
TENANT_ID = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a"

# Tables whose user-triggers should be paused for the bulk insert
TRIGGER_TABLES = [
    "orders",
    "customer_trust",
    "inventory_ledger",
    "order_status_history",
    "order_notifications",
    "activity_logs",
]

PRE_SQL = (
    "-- 00-pre-import: pause USER triggers on hot tables so calculate_customer_trust\n"
    "-- and inv_apply don't fire 1,364 times during the bulk import.\n"
    + "\n".join(f"ALTER TABLE public.{t} DISABLE TRIGGER USER;" for t in TRIGGER_TABLES)
    + "\nSELECT 'triggers paused' AS status;\n"
)

POST_SQL = (
    "-- 99-post-import: re-enable USER triggers.\n"
    + "\n".join(f"ALTER TABLE public.{t} ENABLE TRIGGER USER;" for t in TRIGGER_TABLES)
    + "\nSELECT 'triggers re-enabled' AS status;\n"
)


def sql_for_batch(batch: list[dict], batch_idx: int) -> str:
    """
    Generate one INSERT statement.
    Strategy:
      1. Pass the batch as a jsonb array literal.
      2. Unnest with jsonb_array_elements -> a row of (raw jsonb) per order.
      3. SELECT each column with explicit casts.
      4. For items, do a LATERAL lookup of product_id from public.products
         using items->0->>'name' (only the first item is mapped — most
         orders have exactly 1 item; Prime rows have items=[] and are
         skipped).
    """
    payload = json.dumps(batch, ensure_ascii=False).replace("'", "''")

    return f"""-- batch {batch_idx:03d}: {len(batch)} historical orders
WITH src AS (
    SELECT row_number() OVER () AS rn, raw
    FROM jsonb_array_elements('{payload}'::jsonb) AS raw
),
src_with_items AS (
    SELECT
        s.raw,
        s.rn,
        -- Resolve product_id by name for the first item. Returns NULL if not found.
        CASE
            WHEN jsonb_array_length(s.raw->'items') > 0 THEN
                (SELECT id FROM public.products
                  WHERE tenant_id = '{TENANT_ID}'::uuid
                    AND name = s.raw->'items'->0->>'name'
                  LIMIT 1)
            ELSE NULL
        END AS resolved_product_id
    FROM src s
)
INSERT INTO public.orders (
    order_id, tenant_id, customer_name, phone, secondary_phone,
    city, governorate_code, address_details, address_status,
    items, price, delivery_fee, discount_amount, payment_status,
    status, source,
    is_return, is_replacement, is_archived, is_shop_order, is_test,
    is_pinned, is_reviewed, is_verified_customer,
    needs_attention, attention_reasons,
    notes, internal_notes,
    created_at, updated_at, original_created_at,
    waseet_qr_id, delivered_source,
    risk_metadata,
    sequence_number
)
SELECT
    raw->>'order_id',
    (raw->>'tenant_id')::uuid,
    raw->>'customer_name',
    raw->>'phone',
    NULLIF(raw->>'secondary_phone', ''),
    NULLIF(raw->>'city', ''),
    NULLIF(raw->>'governorate_code', ''),
    NULLIF(raw->>'address_details', ''),
    raw->>'address_status',
    -- Rewrite items to inject product_id (if resolved). Empty array passes through.
    CASE
        WHEN jsonb_array_length(raw->'items') > 0 AND resolved_product_id IS NOT NULL THEN
            jsonb_build_array(
                jsonb_set(
                    raw->'items'->0,
                    '{{product_id}}',
                    to_jsonb(resolved_product_id::text)
                )
            )
        ELSE raw->'items'
    END,
    (raw->>'price')::numeric,
    (raw->>'delivery_fee')::numeric,
    (raw->>'discount_amount')::numeric,
    raw->>'payment_status',
    raw->>'status',
    raw->>'source',
    (raw->>'is_return')::boolean,
    (raw->>'is_replacement')::boolean,
    (raw->>'is_archived')::boolean,
    (raw->>'is_shop_order')::boolean,
    (raw->>'is_test')::boolean,
    (raw->>'is_pinned')::boolean,
    (raw->>'is_reviewed')::boolean,
    (raw->>'is_verified_customer')::boolean,
    (raw->>'needs_attention')::boolean,
    ARRAY(SELECT jsonb_array_elements_text(raw->'attention_reasons')),
    NULLIF(raw->>'notes', ''),
    raw->>'internal_notes',
    (raw->>'created_at')::timestamptz,
    (raw->>'updated_at')::timestamptz,
    (raw->>'original_created_at')::timestamptz,
    NULLIF(raw->>'waseet_qr_id', ''),
    NULLIF(raw->>'delivered_source', ''),
    raw->'risk_metadata',
    -- sequence_number: sentinel -rn so each historical order has a unique
    -- negative number, never colliding with positive sequence numbers from
    -- create_order_atomic. We never use sequence_number as an FK anywhere.
    -(rn::int)
FROM src_with_items
ON CONFLICT DO NOTHING;
"""


def main():
    if not IN_JSON.exists():
        raise SystemExit(f"Run transform-historical-csv.py first; {IN_JSON} missing.")
    orders = json.loads(IN_JSON.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    (OUT_DIR / "00-pre-import.sql").write_text(PRE_SQL)
    (OUT_DIR / "99-post-import.sql").write_text(POST_SQL)

    batches = [orders[i:i + BATCH_SIZE] for i in range(0, len(orders), BATCH_SIZE)]
    manifest_lines = [
        "# Historical CSV import — batch manifest",
        f"- Total orders: {len(orders)}",
        f"- Batch size: {BATCH_SIZE}",
        f"- Batches: {len(batches)}",
        "",
        "## Run order",
        "1. `00-pre-import.sql` (pause triggers)",
    ]
    for i, batch in enumerate(batches):
        path = OUT_DIR / f"01-insert-{i:03d}.sql"
        sql = sql_for_batch(batch, i)
        path.write_text(sql)
        manifest_lines.append(f"2.{i+1}. `01-insert-{i:03d}.sql` ({len(batch)} orders, {len(sql)} bytes)")
    manifest_lines += [
        f"{len(batches) + 2}. `99-post-import.sql` (re-enable triggers)",
        "",
        "## After all batches",
        "- Run reconciliation query: SELECT COUNT(*) FROM orders WHERE risk_metadata->>'migration_batch' = 'csv_2026_06_03'",
        "- Expected count: 1364",
    ]
    (OUT_DIR / "MANIFEST.md").write_text("\n".join(manifest_lines))

    # Stats
    sizes = [len((OUT_DIR / f"01-insert-{i:03d}.sql").read_text()) for i in range(len(batches))]
    print(f"✅ Wrote {len(batches)} batch SQL files to {OUT_DIR}")
    print(f"   Smallest: {min(sizes):,} bytes, Largest: {max(sizes):,} bytes, Avg: {sum(sizes)//len(sizes):,}")
    print(f"   Total SQL across all batches: {sum(sizes):,} bytes")


if __name__ == "__main__":
    main()
