#!/usr/bin/env python3
"""
Apply /tmp/scheniders-history.json to new project via Supabase PostgREST API.

Steps:
  1. Read SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL from .env.local
  2. Fetch products under Scheniders Iraq tenant to build a name → product_id map
  3. Rewrite items[].product_name_for_lookup → items[].product_id
  4. Strip transformer-only fields (product_name_for_lookup, is_historical_import)
  5. Mark sequence_number = -row_index (negative sentinel for historical rows)
  6. POST in batches of 50 to /rest/v1/orders with Prefer: return=minimal
  7. Report rows inserted + any failures
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

ENV_FILE = Path("/Users/ali/scheniders-mono/apps/platform/.env.local")
ORDERS_JSON = Path("/tmp/scheniders-history.json")
TENANT_ID = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a"
BATCH_SIZE = 50


def read_env(path: Path) -> dict:
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def http(method: str, url: str, key: str, body: object | None = None, extra_headers: dict | None = None) -> tuple[int, bytes]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    env = read_env(ENV_FILE)
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    print(f"Project: {url}")

    # 1. Fetch products to build name→id map
    print("Fetching products...")
    code, body = http(
        "GET",
        f"{url}/rest/v1/products?tenant_id=eq.{TENANT_ID}&select=id,name",
        key,
    )
    if code != 200:
        sys.exit(f"products fetch failed: {code} {body!r}")
    products = json.loads(body)
    name_to_id = {p["name"]: p["id"] for p in products}
    print(f"  {len(products)} products loaded:")
    for p in products[:5]:
        print(f"    {p['name']!r} → {p['id']}")
    if len(products) > 5:
        print(f"    ... +{len(products) - 5} more")

    # 2. Load orders
    print(f"Loading {ORDERS_JSON}...")
    orders = json.loads(ORDERS_JSON.read_text())
    print(f"  {len(orders)} orders to insert")

    # 3. Transform: resolve product_id, strip transformer-only fields, add sequence_number
    matched = 0
    unmatched = 0
    for i, o in enumerate(orders):
        new_items = []
        for it in o.get("items", []):
            name = it.get("product_name_for_lookup") or it.get("name")
            pid = name_to_id.get(name)
            if pid:
                matched += 1
            else:
                unmatched += 1
            clean_item = {
                "name": it["name"],
                "quantity": it["quantity"],
                "price": it["price"],
                "is_historical_import": True,
            }
            if pid:
                clean_item["product_id"] = pid
            new_items.append(clean_item)
        o["items"] = new_items
        # Negative sequence number — historical rows never collide with positive
        # sequence_numbers produced by create_order_atomic.
        o["sequence_number"] = -(i + 1)
    print(f"  Item matches: {matched} resolved, {unmatched} unresolved (will be NULL product_id)")

    # 4. POST in batches
    print(f"\nInserting in batches of {BATCH_SIZE}...")
    total_ok = 0
    failures = []
    for bi in range(0, len(orders), BATCH_SIZE):
        batch = orders[bi:bi + BATCH_SIZE]
        code, body = http(
            "POST",
            f"{url}/rest/v1/orders",
            key,
            body=batch,
            extra_headers={"Prefer": "return=minimal,resolution=ignore-duplicates"},
        )
        if code in (200, 201, 204):
            total_ok += len(batch)
            sys.stdout.write(f"\r  batch {bi // BATCH_SIZE + 1:2d}/{(len(orders) + BATCH_SIZE - 1) // BATCH_SIZE}  wrote {total_ok}/{len(orders)}")
            sys.stdout.flush()
        else:
            err = body.decode("utf-8", errors="replace")[:300]
            failures.append({"batch_start": bi, "code": code, "error": err})
            print(f"\n  ❌ batch {bi // BATCH_SIZE + 1}: HTTP {code}: {err}")
            # Stop on first failure to avoid cascade
            break
    print()

    print(f"\n✅ Inserted: {total_ok}/{len(orders)}")
    if failures:
        print(f"❌ Failures: {len(failures)}")
        for f in failures:
            print(f"   batch start={f['batch_start']}: HTTP {f['code']}: {f['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
