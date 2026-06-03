#!/usr/bin/env python3
"""
Transform Schenider_FINAL_V21_Upload_Ready (1).csv into orders ready for
INSERT into new project's public.orders under tenant Scheniders Iraq.

Output: /tmp/scheniders-history.json (array of order dicts)
        /tmp/scheniders-history-errors.json (rejected rows + reasons)
        /tmp/scheniders-history-preview.md (first 10 transformed rows for review)

No DB writes. Pure transform.
"""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

# ────────────────────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────────────────────
CSV_PATH = Path("/tmp/scheniders-history.csv")
OUT_JSON = Path("/tmp/scheniders-history.json")
OUT_ERRORS = Path("/tmp/scheniders-history-errors.json")
OUT_PREVIEW = Path("/tmp/scheniders-history-preview.md")

TENANT_ID = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a"
MIGRATION_BATCH = "csv_2026_06_03"
IS_ARCHIVED = False  # user chose "main list"

# Status: CSV → new.orders.status (enum values verified against existing data)
STATUS_MAP = {
    "Completed":   "completed",
    "No Response": "no_response",
    "Rejected":    "rejected",
    "Cancelled":   "cancelled",
    "Refunded":    "refund_delivered",
    "Unknown":     "no_response",   # default, safest
    "Postponed":   "suspended",     # closest match in new
}

# Source: CSV → new.orders.source
SOURCE_MAP = {
    "TikTok":   "tiktok",
    "whatsapp": "whatsapp",
    "واتساب":   "whatsapp",
    "Prime":    "prime",
    "ig":       "meta",     # Instagram = Meta
    "fb":       "meta",     # Facebook = Meta
    "unknown":  "manual",
    "":         "manual",
}

# Governorate: Arabic name → standard code (3-letter)
GOV_MAP = {
    "بغداد":       "BGD",
    "البصرة":      "BSR",
    "كربلاء":      "KRB",
    "النجف":       "NJF",
    "الأنبار":     "ANB",
    "بابل":        "BBL",
    "نينوى":       "NNV",
    "صلاح الدين":  "SLD",
    "أربيل":       "ERB",
    "ميسان":       "MSN",
    "كركوك":       "KIR",
    "ذي قار":      "DQR",
    "ديالى":       "DLY",
    "الديوانية":   "QAD",
    "واسط":        "WST",
    "المثنى":      "MTH",
    "دهوك":        "DHK",
    "السليمانية":  "SUL",
}

# ────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────
def normalize_phone(raw: str) -> str | None:
    """Mirror the DB's normalize_phone() function. Returns digits-only or None."""
    if not raw or raw.strip() in ("", "-", "--", "0"):
        return None
    s = raw.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    s = s.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))
    s = re.sub(r"\D", "", s)
    if s.startswith("964"):
        s = s[3:]
    if s.startswith("0"):
        s = s[1:]
    return s or None

def format_iraqi_phone(raw: str) -> str | None:
    """Return phone in `07XXXXXXXXX` form, or None if invalid."""
    if not raw or raw.strip() in ("", "-", "--"):
        return None
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("964"):
        digits = digits[3:]
    if digits.startswith("07") and len(digits) == 11:
        return digits
    if digits.startswith("7") and len(digits) == 10:
        return "0" + digits
    # Don't fail on malformed — store as-is, mark for review
    return digits if len(digits) >= 7 else None

def parse_price(raw: str) -> int:
    """'د.ع 36,750' → 36750. Empty → 0."""
    if not raw:
        return 0
    s = re.sub(r"[^\d]", "", raw)
    return int(s) if s else 0

def parse_qty(raw: str) -> int:
    if not raw:
        return 0
    try:
        return int(float(raw))
    except ValueError:
        return 0

def parse_date(raw: str) -> str | None:
    """Returns ISO-8601 UTC string."""
    raw = raw.strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).isoformat() + "+00:00"
        except ValueError:
            continue
    return None

# ────────────────────────────────────────────────────────────────────────
# Transform
# ────────────────────────────────────────────────────────────────────────
def main():
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    print(f"Read {len(rows)} CSV rows")

    # Pass 1: detect duplicate order_ids (rename strategy A)
    oid_counts = Counter(r["رقم الوصل"].strip() for r in rows)
    dups = {oid for oid, c in oid_counts.items() if c > 1}
    dup_seen: dict[str, int] = {}

    output = []
    errors = []

    for idx, r in enumerate(rows):
        try:
            raw_oid = r["رقم الوصل"].strip()
            csv_status = r["حالة الطلب"].strip()
            csv_source = r["مصدر"].strip()
            csv_product = r["اسم المنتج"].strip()
            csv_qty = parse_qty(r["الكمية"])
            csv_price_total = parse_price(r["سعر المنتج"])
            csv_name = r["اسم الزبون"].strip()
            csv_phone1 = r["رقم الهاتف الاول"].strip()
            csv_phone2 = r["رقم الهاتف الثاني"].strip()
            csv_addr = r["العنوان"].strip()
            csv_gov = r["المحافظة"].strip()
            csv_notes = r["ملاحظات"].strip()
            csv_date = r["التاريخ"].strip()
            csv_waseet = r["رقم شركة التوصيل"].strip()

            phone1 = format_iraqi_phone(csv_phone1)
            phone2 = format_iraqi_phone(csv_phone2)
            phone_normalized = normalize_phone(csv_phone1)

            # Reject if no phone — can't track customer at all
            if not phone1 and not phone_normalized:
                errors.append({"row": idx, "reason": "no_valid_phone",
                               "raw": {"phone1": csv_phone1, "name": csv_name, "oid": raw_oid}})
                continue

            # Handle duplicate order_ids (strategy A: rename)
            if raw_oid in dups:
                dup_seen[raw_oid] = dup_seen.get(raw_oid, 0) + 1
                order_id = f"{raw_oid}-dup{dup_seen[raw_oid]}"
            else:
                order_id = raw_oid

            # Map status/source
            status = STATUS_MAP.get(csv_status, "no_response")
            source = SOURCE_MAP.get(csv_source, "manual")
            gov_code = GOV_MAP.get(csv_gov) if csv_gov else None

            # Customer name fallback
            customer_name = csv_name if csv_name and csv_name not in ("-", "--") else "—"

            # Build items JSON. Prime rows have no product/qty → empty items.
            # Other rows: items[0] has the product info; we'll resolve product_id at insert time via SQL subquery.
            items: list[dict] = []
            if csv_product and csv_qty > 0:
                unit_price = csv_price_total // csv_qty if csv_qty > 0 else 0
                items.append({
                    "name": csv_product,
                    "quantity": csv_qty,
                    "price": unit_price,
                    "product_name_for_lookup": csv_product,  # importer will resolve UUID
                    "is_historical_import": True,
                })

            # Date handling — historical date as created_at and original_created_at
            created_at = parse_date(csv_date) or "2025-12-31T23:59:59+00:00"

            # Notes
            notes_combined = []
            if csv_notes:
                notes_combined.append(csv_notes)
            if source == "prime" and not items:
                notes_combined.append("Prime delivery-only record (no product/price)")

            # attention_reasons for surfacing
            attention = ["historical_import"]
            if not csv_name or csv_name in ("-", "--"):
                attention.append("missing_customer_name")
            if not items:
                attention.append("no_product_data")

            order = {
                # Identifiers
                "order_id": order_id,
                "tenant_id": TENANT_ID,
                # Customer
                "customer_name": customer_name,
                "phone": phone1 or phone_normalized,
                "secondary_phone": phone2 if phone2 and phone2 != phone1 else None,
                # Address
                "city": csv_gov or None,    # CSV doesn't separate city; gov is best signal
                "governorate_code": gov_code,
                "address_details": csv_addr or None,
                "address_status": "needs_review" if not csv_addr else "validated",
                # Items + price
                "items": items,
                "price": csv_price_total,
                "delivery_fee": 0,
                "discount_amount": 0,
                "payment_status": "cod",
                # Status
                "status": status,
                "source": source,
                # Flags
                "is_return": False,
                "is_replacement": False,
                "is_archived": IS_ARCHIVED,
                "is_shop_order": False,
                "is_test": False,
                "is_pinned": False,
                "is_reviewed": False,
                "is_verified_customer": False,
                "needs_attention": True,
                "attention_reasons": attention,
                # Notes
                "notes": " | ".join(notes_combined) if notes_combined else None,
                "internal_notes": f"Imported from CSV on 2026-06-03. Original status: {csv_status!r}. Source row: {idx}.",
                # Dates
                "created_at": created_at,
                "updated_at": created_at,
                "original_created_at": created_at,
                # Delivery
                "waseet_qr_id": csv_waseet or None,
                "delivered_source": "manual" if status == "completed" else None,
                # Risk metadata — for batch identification/rollback
                "risk_metadata": {
                    "migration_batch": MIGRATION_BATCH,
                    "csv_row_index": idx,
                    "csv_original_order_id": raw_oid,
                    "csv_original_status": csv_status,
                    "csv_original_source": csv_source,
                    "csv_original_product": csv_product or None,
                    "csv_original_qty": csv_qty or None,
                },
            }
            output.append(order)
        except Exception as e:
            errors.append({"row": idx, "reason": f"transform_error: {e}", "raw": dict(r)})

    # Write outputs
    OUT_JSON.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    OUT_ERRORS.write_text(json.dumps(errors, ensure_ascii=False, indent=2))

    # Build human-readable preview (first 10 + summary)
    lines = [
        "# Historical CSV transform preview\n",
        f"- Total CSV rows: {len(rows)}",
        f"- Transformed successfully: {len(output)}",
        f"- Rejected (errors): {len(errors)}",
        f"- Tenant: `{TENANT_ID}` (Scheniders Iraq)",
        f"- `is_archived`: `{IS_ARCHIVED}` (visible in main list)",
        f"- Migration batch tag: `{MIGRATION_BATCH}` in `risk_metadata`",
        "",
        "## First 10 transformed rows\n",
    ]
    for i, o in enumerate(output[:10]):
        lines.append(f"### Row {i}: order_id `{o['order_id']}`")
        lines.append(f"- customer: `{o['customer_name']}` | phone: `{o['phone']}`")
        lines.append(f"- city/gov: `{o['city']}` (`{o['governorate_code']}`)")
        lines.append(f"- status: `{o['status']}` | source: `{o['source']}`")
        lines.append(f"- items: `{json.dumps(o['items'], ensure_ascii=False)}`")
        lines.append(f"- price: `{o['price']}` IQD | created_at: `{o['created_at']}`")
        lines.append(f"- attention: `{o['attention_reasons']}`")
        lines.append(f"- notes: `{o['notes']}`")
        lines.append("")
    if errors:
        lines.append("## Rejected rows\n")
        for e in errors[:10]:
            lines.append(f"- row {e['row']}: {e['reason']} — raw: `{json.dumps(e['raw'], ensure_ascii=False)[:160]}`")
    OUT_PREVIEW.write_text("\n".join(lines))

    # Summary to stdout
    print(f"\n✅ Wrote {OUT_JSON} ({len(output)} orders)")
    print(f"⚠️  Wrote {OUT_ERRORS} ({len(errors)} rejected)")
    print(f"📋 Wrote {OUT_PREVIEW}")
    print(f"\nStatus distribution:")
    for k, v in Counter(o["status"] for o in output).most_common():
        print(f"  {k:20}  {v}")
    print(f"\nSource distribution:")
    for k, v in Counter(o["source"] for o in output).most_common():
        print(f"  {k:15}  {v}")
    print(f"\nPrice total: {sum(o['price'] for o in output):,} IQD")

if __name__ == "__main__":
    main()
