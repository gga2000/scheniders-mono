# PDP order safety net — P3: half filled capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox () syntax for tracking.

**Spec:** docs/superpowers/specs/2026-10-21-pdp-order-safety-net-design.md · **Index:** docs/superpowers/plans/2026-10-21-safety-net-index.md

---

## P3 — Half-filled phone capture with consent (reminder stays OFF)

**Goal:** The PDP form (classic and express) saves a phone the buyer typed, but only when the store shows a consent line under the phone field. Nothing is sent to that number. The capture endpoint:
- resolves the tenant from the request host, never from the body
- rate-limits each IP and each phone
- records `consent_at` and `consent_text_version`

Captures appear in the platform «متروكة» tab next to the existing `pending_checkout` rows, which do not change. A real storefront order marks the capture recovered. The database derives whether that recovery came after a reminder or happened on its own. The reminder sweep can never message a capture that has no consent.

**Preconditions:**
- The origin/main merge is committed: `git -C /Users/ali/scheniders-mono status --porcelain | grep -E '^(UU|AA|DU|UD)'` prints nothing.
- Line numbers below come from the working tree on 2026-10-21, before P1 and P2. Build order is P1 → P2 → P3 → P4 → P5, so P1 and P2 have already moved them. Every edit also gives a content anchor: match on the anchor.
- P1 and P2 are committed. Each of these must print a count of 1 or more: `grep -c queueOrderConfirmation apps/storefront/app/actions/checkout.ts`, `grep -c create_storefront_order apps/storefront/app/actions/checkout.ts`, `grep -c 'SubmitStatus' packages/sections/src/pdp_direct_order.client.tsx`. P3 relies on P2's names: the `create_storefront_order` RPC (P3.4 test), `SubmitStatus` (P3.5 beacon gate), and the widened `Result.error` in `fake-supabase.ts` (P3.3 adds `upsert` next to it).

**Env for every command:**
```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
cd /Users/ali/scheniders-mono
```

**Commit identity (every commit):**
`git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<msg>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

**Facts this piece relies on (re-verified 2026-10-21):**
- **Live `abandoned_carts`:**
  - 0 rows
  - columns: `id, tenant_id, phone, items, subtotal_iqd, governorate, locale, created_at, updated_at, reminded_at, recovered_at`
  - RLS on; the only policy is `abandoned_carts_member_select` (SELECT, authenticated, `tenant_id IN get_user_tenant_ids()`)
  - `UNIQUE (tenant_id, phone)`
  - `consume_rate_limit(_key text, _limit int, _window_seconds int)` exists
- **Main already ships a PDP beacon:** `packages/sections/src/pdp_direct_order.client.tsx:585-626`. It has no consent, sends `tenant_id`, `name` and `price`, and is pinned by `_customer-memory-forms.test.tsx:94-117`. This piece gates it and changes its body.
- **The capture endpoint is wide open:** `apps/storefront/app/api/cart/abandoned/route.ts:20-26` trusts body `tenant_id` and client prices, with no rate limit and no consent.
- **`submitCheckout` marks recovered unconditionally:** at `apps/storefront/app/actions/checkout.ts:736-744` it does this even for draft-view test orders, and it ignores the update error.
- **A second caller beacons the same endpoint:** `packages/sections/src/checkout_form.client.tsx:346-373` (the cart `/checkout` page) posts `tenant_id`, per-line `name`/`price` and `governorate`, with no consent. It is not a PDP layout, so this piece does not gate it; Task P3.3 keeps its body accepted (extra keys stripped, tenant from the host), and its rows land with `consent_at` NULL, so the sweep can never message them (Task P3.9).
- **The sweep has no consent check:** `apps/platform/app/api/cron/abandoned-cart-recovery/route.ts:41-48` selects carts with no consent filter.
- **Tenant from host:** `apps/storefront/proxy.ts` rewrites store pages, but every `/api/*` passes through untouched (`proxy.ts:144-150`), so the API route has to work out the store from `Host` itself. On the root domain it uses the same-origin `Referer` path `/s/{slug}/…`.

---

### Task P3.1: Additive migration (consent columns and derived recovery kind) plus DB types

**Files:**
- Create: `packages/supabase/migrations/20261021160000_abandoned_carts_consent_and_recovery_kind.sql`. If any migration file with a later timestamp exists when you get here, rename this one so it sorts last.
- Modify: `packages/supabase/src/database.types.ts:17-56` (the `abandoned_carts` Row/Insert/Update blocks)

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================
-- FEATURE: PDP order safety net, piece 3: consented phone capture
--
-- Additive only. abandoned_carts keeps its RLS exactly as created in
-- 20260621120000_abandoned_carts.sql (member SELECT; writes service-role
-- only).
--
--   consent_at / consent_text_version: set by the storefront capture
--     endpoint when the buyer typed their phone with the merchant's consent
--     line on screen. The version is "sha256:" + 16 hex of the exact line
--     shown, so it can be matched against the store config revision that
--     rendered it. Both or neither (CHECK below).
--   recovery_kind: how a recovered capture came back. It is derived from the
--     two timestamps the app already writes: 'after_reminder' when a reminder
--     went out before the order, else 'organic'. No writer can get it wrong.
-- =============================================

ALTER TABLE public.abandoned_carts
    ADD COLUMN IF NOT EXISTS consent_at timestamptz,
    ADD COLUMN IF NOT EXISTS consent_text_version text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.abandoned_carts'::regclass
          AND conname = 'abandoned_carts_consent_pair'
    ) THEN
        ALTER TABLE public.abandoned_carts
            ADD CONSTRAINT abandoned_carts_consent_pair
            CHECK ((consent_at IS NULL) = (consent_text_version IS NULL));
    END IF;
END $$;

ALTER TABLE public.abandoned_carts
    ADD COLUMN IF NOT EXISTS recovery_kind text
    GENERATED ALWAYS AS (
        CASE
            WHEN recovered_at IS NULL THEN NULL
            WHEN reminded_at IS NOT NULL AND reminded_at <= recovered_at THEN 'after_reminder'
            ELSE 'organic'
        END
    ) STORED;

-- The orders «متروكة» worklist reads a tenant's open captures, newest first.
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_tenant_open
    ON public.abandoned_carts (tenant_id, updated_at DESC)
    WHERE recovered_at IS NULL;

COMMENT ON COLUMN public.abandoned_carts.consent_at IS
    'When the buyer typed this phone with the WhatsApp consent line shown. NULL = no consent: staff may call; no automatic message may be sent.';
COMMENT ON COLUMN public.abandoned_carts.consent_text_version IS
    'sha256:<16 hex> of the exact consent line the buyer saw.';
COMMENT ON COLUMN public.abandoned_carts.recovery_kind IS
    'Derived: after_reminder | organic | NULL (not recovered).';

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply it**

Use the Supabase MCP `apply_migration` on project `sduvpgqwhxragxtxztur`:
- `name`: `abandoned_carts_consent_and_recovery_kind`
- `query`: the exact SQL from Step 1

- [ ] **Step 3: Verify the live schema (read-only `execute_sql`)**

```sql
select column_name, data_type, is_nullable, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public' and table_name = 'abandoned_carts'
  and column_name in ('consent_at', 'consent_text_version', 'recovery_kind')
order by column_name;
```
Expected: 3 rows.
- `consent_at`: `timestamp with time zone`, YES, NEVER
- `consent_text_version`: `text`, YES, NEVER
- `recovery_kind`: `text`, YES, ALWAYS, and its expression contains `after_reminder`

```sql
select c.relrowsecurity,
       (select json_agg(polname::text || ':' || polcmd::text) from pg_policy where polrelid = c.oid) as policies,
       (select count(*) from pg_constraint where conrelid = c.oid and conname = 'abandoned_carts_consent_pair') as consent_check,
       (select count(*) from pg_indexes where tablename = 'abandoned_carts' and indexname = 'idx_abandoned_carts_tenant_open') as open_idx
from pg_class c where c.oid = 'public.abandoned_carts'::regclass;
```
Expected:
- `relrowsecurity` = true
- `policies` = `["abandoned_carts_member_select:r"]`
- `consent_check` = 1
- `open_idx` = 1

Then run Supabase MCP `get_advisors` (type `security`). There must be no new finding on `abandoned_carts`.

- [ ] **Step 4: Update the TS types by hand**

Hand-editing keeps the diff to this table. A full `pnpm generate-types` would also pull in unrelated drift.

In `packages/supabase/src/database.types.ts`, replace lines 18-56 (from `Row: {` through the end of `Update: {…}`, inside `abandoned_carts: {`) with:

```ts
        Row: {
          consent_at: string | null
          consent_text_version: string | null
          created_at: string
          governorate: string | null
          id: string
          items: Json
          locale: string | null
          phone: string
          recovered_at: string | null
          recovery_kind: string | null
          reminded_at: string | null
          subtotal_iqd: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          consent_at?: string | null
          consent_text_version?: string | null
          created_at?: string
          governorate?: string | null
          id?: string
          items?: Json
          locale?: string | null
          phone: string
          recovered_at?: string | null
          recovery_kind?: never
          reminded_at?: string | null
          subtotal_iqd?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          consent_at?: string | null
          consent_text_version?: string | null
          created_at?: string
          governorate?: string | null
          id?: string
          items?: Json
          locale?: string | null
          phone?: string
          recovered_at?: string | null
          recovery_kind?: never
          reminded_at?: string | null
          subtotal_iqd?: number
          tenant_id?: string
          updated_at?: string
        }
```

- [ ] **Step 5: Type-check both consumers**

```bash
pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check
```
Expected: exit 0 for both.

- [ ] **Step 6: Commit**

```bash
git add packages/supabase/migrations/20261021160000_abandoned_carts_consent_and_recovery_kind.sql packages/supabase/src/database.types.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(db): consent columns and derived recovery_kind on abandoned_carts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.2: Resolve the store from the request host (shared with the proxy)

**Files:**
- Create: `apps/storefront/lib/store-host.ts`
- Create: `apps/storefront/lib/store-host.test.ts`
- Modify: `apps/storefront/proxy.ts:91-121` (the `ROOT_DOMAIN` const and the `extractSlug` function move out) and `:134` (the call site)

- [ ] **Step 1: Write the failing test** `apps/storefront/lib/store-host.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractSlug, storeKeyFromRequest } from "./store-host";

const ROOT = "scheniders.test";
const h = (init: Record<string, string>): Headers => new Headers(init);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("extractSlug", () => {
  it("reads a store subdomain", () => {
    expect(extractSlug("shop.scheniders.test", ROOT)).toEqual({ slug: "shop", isCustom: false });
  });

  it("ignores the port on both sides", () => {
    expect(extractSlug("shop.localhost:3001", "localhost:3001")).toEqual({ slug: "shop", isCustom: false });
  });

  it("treats the root domain and www as no store", () => {
    expect(extractSlug("scheniders.test", ROOT)).toEqual({ slug: null, isCustom: false });
    expect(extractSlug("www.scheniders.test", ROOT)).toEqual({ slug: null, isCustom: false });
  });

  it("treats any other host as a store's own domain", () => {
    expect(extractSlug("shop.example.com", ROOT)).toEqual({ slug: "shop.example.com", isCustom: true });
  });
});

describe("storeKeyFromRequest", () => {
  it("names a subdomain store by its slug", () => {
    expect(storeKeyFromRequest(h({ host: "shop.scheniders.test" }), ROOT)).toBe("shop");
  });

  it("names a custom-domain store the way the [tenant] route does", () => {
    expect(storeKeyFromRequest(h({ host: "shop.example.com" }), ROOT)).toBe("__domain__shop.example.com");
  });

  it("lets the host win over whatever the referer says", () => {
    expect(
      storeKeyFromRequest(
        h({ host: "shop.scheniders.test", referer: "https://scheniders.test/s/other/products/x" }),
        ROOT,
      ),
    ).toBe("shop");
  });

  it("reads a path-based store from a same-origin referer on the root domain", () => {
    expect(
      storeKeyFromRequest(
        h({ host: "scheniders.test", referer: "https://scheniders.test/s/shop/products/x" }),
        ROOT,
      ),
    ).toBe("shop");
  });

  it("refuses a referer from another origin", () => {
    expect(
      storeKeyFromRequest(h({ host: "scheniders.test", referer: "https://evil.example/s/shop/" }), ROOT),
    ).toBeNull();
  });

  it("names no store on the root domain without a referer", () => {
    expect(storeKeyFromRequest(h({ host: "scheniders.test" }), ROOT)).toBeNull();
  });

  it("does not treat the editor preview as a store page", () => {
    expect(
      storeKeyFromRequest(h({ host: "scheniders.test", referer: "https://scheniders.test/_preview/shop/home" }), ROOT),
    ).toBeNull();
  });

  it("names no store for an unparseable referer or a missing host", () => {
    expect(storeKeyFromRequest(h({ host: "scheniders.test", referer: "not a url" }), ROOT)).toBeNull();
    expect(storeKeyFromRequest(h({}), ROOT)).toBeNull();
  });

  it("defaults the root domain from the environment, like the proxy", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "scheniders.test");
    expect(storeKeyFromRequest(h({ host: "shop.scheniders.test" }))).toBe("shop");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
CI=true pnpm exec vitest run apps/storefront/lib/store-host.test.ts
```
Expected: FAIL with `Failed to resolve import "./store-host"`.

- [ ] **Step 3: Implement** `apps/storefront/lib/store-host.ts`

```ts
// =====================================================================
// Which store does this request belong to? Decided from the request
// =====================================================================
// One reading of the Host header, shared by the proxy (which rewrites store
// pages onto /s/[tenant]) and by API routes. The proxy passes every /api/*
// request through untouched, so a route that writes on a store's behalf
// must work out the store itself, and never from its request body.
//
//   shop.<root>        → "shop"
//   shop.example.com   → "__domain__shop.example.com" (a store's own domain)
//   <root> / www.<root>: path-based access (/s/{slug}/…). The page that sent
//                        the request names the store in its same-origin
//                        Referer; anything else names none.
// =====================================================================

/** The platform's root domain, read the way the proxy always has. */
export function storefrontRootDomain(): string {
  return (
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
    process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ||
    "localhost:3001"
  );
}

/**
 * Extracts the tenant slug from the host header.
 *
 * Examples:
 *   acme.scheniders.com   → "acme"
 *   acme.localhost:3001   → "acme"
 *   scheniders.com        → null (root domain)
 *   custom-domain.com     → "custom-domain.com", isCustom
 */
export function extractSlug(
  host: string,
  rootDomain: string,
): { slug: string | null; isCustom: boolean } {
  // Strip port for matching
  const hostNoPort = host.split(":")[0];
  const rootNoPort = rootDomain.split(":")[0];

  if (hostNoPort === rootNoPort || hostNoPort === `www.${rootNoPort}`) {
    return { slug: null, isCustom: false };
  }

  if (hostNoPort.endsWith(`.${rootNoPort}`)) {
    const slug = hostNoPort.slice(0, -1 - rootNoPort.length);
    return { slug, isCustom: false };
  }

  // Treat as a custom domain
  return { slug: hostNoPort, isCustom: true };
}

/** A store page on the root domain: /s/{slug} or /s/{slug}/… */
const PATH_STORE = /^\/s\/([^/]+)(?:\/|$)/;

/**
 * The `[tenant]` route key (a slug, or `__domain__<host>`) of the store this
 * request was made from, or null when the request names no store.
 */
export function storeKeyFromRequest(
  headers: Headers,
  rootDomain: string = storefrontRootDomain(),
): string | null {
  const host = headers.get("host") ?? "";
  const { slug, isCustom } = extractSlug(host, rootDomain);
  if (slug) return isCustom ? `__domain__${slug}` : slug;

  const referer = headers.get("referer");
  if (!referer || !host) return null;
  let page: URL;
  try {
    page = new URL(referer);
  } catch {
    // An unparseable referer names no page, so it names no store.
    return null;
  }
  if (page.host !== host) return null;
  return PATH_STORE.exec(page.pathname)?.[1] ?? null;
}
```

- [ ] **Step 4: Point the proxy at the shared helper**

In `apps/storefront/proxy.ts`:
- Change line 1 from `import { NextRequest, NextResponse } from "next/server";` to:
```ts
import { NextRequest, NextResponse } from "next/server";
import { extractSlug, storefrontRootDomain } from "@/lib/store-host";
```
- Replace lines 91-121 (from `const ROOT_DOMAIN =` through the closing `}` of `function extractSlug`) with:
```ts
const ROOT_DOMAIN = storefrontRootDomain();
```
- Inside `proxy()` (anchor `const { slug, isCustom } = extractSlug(host);`), change it to:
```ts
  const { slug, isCustom } = extractSlug(host, ROOT_DOMAIN);
```

- [ ] **Step 5: Run the new test and the proxy's own test**

```bash
CI=true pnpm exec vitest run apps/storefront/lib/store-host.test.ts apps/storefront/lib/proxy-tenant-files.test.ts
```
Expected: PASS (all tests).

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @scheniders/storefront type-check
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/storefront/lib/store-host.ts apps/storefront/lib/store-host.test.ts apps/storefront/proxy.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "refactor(storefront): share host-to-store resolution between proxy and API routes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.3: Harden `/api/cart/abandoned`

The hardened route:
- resolves the tenant from the host
- rejects stores that are not live, and skips draft view
- rate-limits each IP and each phone
- takes prices and names from the catalogue
- records consent

**Files:**
- Modify: `apps/storefront/lib/testing/fake-supabase.ts:30-35` (`WriteCall.op`) and `:61-121` (add `upsert`). P2 widens this file's `Result.error` type (lines 20-23) first; match the quoted anchors below, not the line numbers.
- Modify (full rewrite): `apps/storefront/app/api/cart/abandoned/route.ts` (lines 1-70)
- Modify (full rewrite): `apps/storefront/app/api/cart/abandoned/route.test.ts` (lines 1-68)

- [ ] **Step 1: Teach the in-memory PostgREST double `upsert`** (test infrastructure only)

In `apps/storefront/lib/testing/fake-supabase.ts`:
- Lines 30-35 become:
```ts
export interface WriteCall {
  table: string;
  op: "update" | "insert" | "upsert";
  payload: Row;
  matched: number;
}
```
- Inside `function from(table: string)`, replace
```ts
    let op: "select" | "update" | "insert" = "select";
    let payload: Row = {};
```
with
```ts
    let op: "select" | "update" | "insert" | "upsert" = "select";
    let payload: Row = {};
    // upsert: the columns of the unique key it resolves conflicts on.
    let conflictCols: string[] = ["id"];
```
- In `run`, directly after the `if (op === "insert") { … }` block, add:
```ts
      if (op === "upsert") {
        // Postgres ON CONFLICT … DO UPDATE: a row with the same key takes the
        // given columns and keeps every column the payload leaves out.
        const list = tables[table] ?? (tables[table] = []);
        const existing = list.find((r) => conflictCols.every((c) => r[c] === payload[c]));
        if (existing) Object.assign(existing, payload);
        else list.push({ ...payload });
        writes.push({ table, op, payload, matched: existing ? 1 : 0 });
        return { data: [payload], error: null };
      }
```
- In `chain`, after the `insert: (values: Row) => { … },` entry, add:
```ts
      upsert: (values: Row, opts?: { onConflict?: string }) => {
        op = "upsert";
        payload = values;
        conflictCols = (opts?.onConflict ?? "id").split(",").map((c) => c.trim());
        return chain;
      },
```

- [ ] **Step 2: Write the failing test.** Replace `apps/storefront/app/api/cart/abandoned/route.test.ts` entirely:

```ts
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/route-guards", () => ({
  resolveStoreTenant: vi.fn(),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeRateLimit: vi.fn() };
});

import { POST } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveStoreTenant } from "@/lib/route-guards";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  createFakeSupabase,
  type FakeSupabase,
  type FakeSupabaseOptions,
  type Row,
} from "@/lib/testing/fake-supabase";
import type { Tenant } from "@/lib/types";

const TENANT_ID = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT_ID = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";
const PRODUCT_ID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const OTHER_PRODUCT_ID = "b2c3d4e5-f6a7-4890-bc23-de45f6a7b8c9";
const VARIANT_ID = "c3d4e5f6-a7b8-4901-8d34-ef56a7b8c9d0";
const CONSENT = "ممكن نراسلك واتساب بخصوص طلبك";
const ALLOW = { allowed: true, remaining: 10, retryAfterSeconds: 0 };
const DENY = { allowed: false, remaining: 0, retryAfterSeconds: 42 };

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: TENANT_ID,
    business_name: "Store",
    slug: "shop",
    status: "active",
    ...overrides,
  } as unknown as Tenant;
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://shop.scheniders.test/api/cart/abandoned", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "shop.scheniders.test",
      "x-forwarded-for": "1.2.3.4",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function install(carts: Row[] = [], options: FakeSupabaseOptions = {}): FakeSupabase {
  const fake = createFakeSupabase(
    {
      products: [
        {
          id: PRODUCT_ID,
          tenant_id: TENANT_ID,
          name: "عطر",
          price: 25000,
          website_price: null,
          status: "active",
          is_visible: true,
          is_archived: false,
          is_supply: false,
        },
        {
          id: OTHER_PRODUCT_ID,
          tenant_id: OTHER_TENANT_ID,
          name: "Other",
          price: 9000,
          website_price: null,
          status: "active",
          is_visible: true,
          is_archived: false,
          is_supply: false,
        },
      ],
      product_variants: [
        { id: VARIANT_ID, product_id: PRODUCT_ID, tenant_id: TENANT_ID, price: 30000, is_enabled: true },
      ],
      abandoned_carts: carts,
    },
    options,
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const line = { product_id: PRODUCT_ID, variant_id: null, quantity: 2 };
const phoneKey = (tenantId: string, phone: string): string =>
  createHash("sha256").update(`${tenantId}:${phone}`).digest("hex").slice(0, 32);
const consentVersion = (text: string): string =>
  `sha256:${createHash("sha256").update(text.normalize("NFC")).digest("hex").slice(0, 16)}`;
const carts = (fake: FakeSupabase): Row[] => fake.tables.abandoned_carts;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "scheniders.test");
  vi.mocked(resolveStoreTenant).mockResolvedValue(tenant());
  vi.mocked(consumeRateLimit).mockResolvedValue(ALLOW);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/cart/abandoned", () => {
  it("400s on an invalid body", async () => {
    const res = await POST(req({ phone: "x", items: [] }));
    expect(res.status).toBe(400);
    expect(resolveStoreTenant).not.toHaveBeenCalled();
  });

  it("no-ops (skipped) on an unmessageable phone", async () => {
    const fake = install();
    const res = await POST(req({ phone: "12345", items: [line] }));
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe("phone");
    expect(carts(fake)).toEqual([]);
  });

  it("files the capture under the store the host names, never the body's tenant_id", async () => {
    const fake = install();
    const res = await POST(
      req({ tenant_id: OTHER_TENANT_ID, phone: "+964 770 123 4567", items: [line] }),
    );
    expect(res.status).toBe(200);
    expect(resolveStoreTenant).toHaveBeenCalledWith("shop");
    expect(carts(fake)).toHaveLength(1);
    expect(carts(fake)[0]).toMatchObject({ tenant_id: TENANT_ID, phone: "07701234567" });
  });

  it("reads a path-based store from the same-origin page on the root domain", async () => {
    install();
    await POST(
      req(
        { phone: "07701234567", items: [line] },
        { host: "scheniders.test", referer: "https://scheniders.test/s/shop/products/x" },
      ),
    );
    expect(resolveStoreTenant).toHaveBeenCalledWith("shop");
  });

  it("400s when the request names no store", async () => {
    const fake = install();
    const res = await POST(req({ phone: "07701234567", items: [line] }, { host: "scheniders.test" }));
    expect(res.status).toBe(400);
    expect(resolveStoreTenant).not.toHaveBeenCalled();
    expect(carts(fake)).toEqual([]);
  });

  it("404s for an unknown store or one that is not live", async () => {
    const fake = install();
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(null);
    expect((await POST(req({ phone: "07701234567", items: [line] }))).status).toBe(404);
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(tenant({ status: "suspended" } as Partial<Tenant>));
    expect((await POST(req({ phone: "07701234567", items: [line] }))).status).toBe(404);
    expect(carts(fake)).toEqual([]);
  });

  it("captures nothing for the merchant's own draft-view session", async () => {
    const fake = install();
    vi.mocked(resolveStoreTenant).mockResolvedValueOnce(tenant({ is_draft_view: true }));
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect((await res.json()).skipped).toBe("draft");
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(carts(fake)).toEqual([]);
  });

  it("drops a line for another store's product (nothing left → no row)", async () => {
    const fake = install();
    const res = await POST(
      req({ phone: "07701234567", items: [{ product_id: OTHER_PRODUCT_ID, variant_id: null, quantity: 1 }] }),
    );
    expect((await res.json()).skipped).toBe("items");
    expect(carts(fake)).toEqual([]);
  });

  it("prices and names every line from the catalogue, not the client", async () => {
    const fake = install();
    await POST(
      req({
        phone: "07701234567",
        items: [
          { ...line, price: 1, name: "fake" },
          { product_id: PRODUCT_ID, variant_id: VARIANT_ID, quantity: 1 },
        ],
        governorate: "BG",
        locale: "ar",
      }),
    );
    expect(carts(fake)[0]).toMatchObject({
      items: [
        { product_id: PRODUCT_ID, variant_id: null, name: "عطر", quantity: 2, price: 25000 },
        { product_id: PRODUCT_ID, variant_id: VARIANT_ID, name: "عطر", quantity: 1, price: 30000 },
      ],
      subtotal_iqd: 80000,
      governorate: "BG",
      locale: "ar",
    });
  });

  it("accepts the cart checkout_form beacon body unchanged, as a capture without consent", async () => {
    // checkout_form.client.tsx still sends tenant_id, name, price and an
    // empty governorate while none is picked. All of those are ignored or
    // degraded, never trusted, and no consent is recorded.
    const fake = install();
    const res = await POST(
      req({
        tenant_id: OTHER_TENANT_ID,
        phone: "07701234567",
        items: [{ product_id: PRODUCT_ID, variant_id: null, name: "x", quantity: 1, price: 1 }],
        governorate: "",
        locale: "ar",
      }),
    );
    expect(res.status).toBe(200);
    expect(carts(fake)[0]).toMatchObject({
      tenant_id: TENANT_ID,
      subtotal_iqd: 25000,
      governorate: null,
    });
    expect(carts(fake)[0].consent_at ?? null).toBeNull();
    expect(carts(fake)[0].consent_text_version ?? null).toBeNull();
  });

  it("records consent and the version of the exact line shown", async () => {
    const fake = install();
    await POST(req({ phone: "07701234567", items: [line], consent_text: CONSENT }));
    const row = carts(fake)[0];
    expect(typeof row.consent_at).toBe("string");
    expect(Number.isNaN(Date.parse(String(row.consent_at)))).toBe(false);
    expect(row.consent_text_version).toBe(consentVersion(CONSENT));
  });

  it("a later capture without consent keeps the consent, and the recovery, already recorded", async () => {
    const fake = install([
      {
        id: "c1",
        tenant_id: TENANT_ID,
        phone: "07701234567",
        items: [],
        subtotal_iqd: 0,
        consent_at: "2026-10-21T10:00:00.000Z",
        consent_text_version: "sha256:abc",
        recovered_at: "2026-10-21T11:00:00.000Z",
        reminded_at: null,
      },
    ]);
    await POST(req({ phone: "07701234567", items: [line] }));
    expect(carts(fake)).toHaveLength(1);
    expect(carts(fake)[0]).toMatchObject({
      consent_at: "2026-10-21T10:00:00.000Z",
      consent_text_version: "sha256:abc",
      recovered_at: "2026-10-21T11:00:00.000Z",
      subtotal_iqd: 50000,
    });
  });

  it("rate-limits per IP and per (store, phone), failing closed, and writes nothing over the limit", async () => {
    const fake = install();
    vi.mocked(consumeRateLimit).mockImplementation(async (key) =>
      key.startsWith("cart-capture:phone:") ? DENY : ALLOW,
    );
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const calls = vi.mocked(consumeRateLimit).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([
      "cart-capture:ip:1.2.3.4",
      `cart-capture:phone:${phoneKey(TENANT_ID, "07701234567")}`,
    ]);
    for (const c of calls) expect(c[3]).toBe("fail-closed");
    expect(carts(fake)).toEqual([]);
  });

  it("500s, logged, when the catalogue cannot be read", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = install([], { failingTables: ["products"] });
    const res = await POST(req({ phone: "07701234567", items: [line] }));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    expect(carts(fake)).toEqual([]);
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
CI=true pnpm exec vitest run apps/storefront/app/api/cart/abandoned/route.test.ts
```
Expected: FAIL. Most cases fail: the current route requires a body `tenant_id` (so it 400s) and never calls `resolveStoreTenant` or `consumeRateLimit`. "400s on an invalid body" and "no-ops (skipped)" may pass.

- [ ] **Step 4: Implement.** Replace `apps/storefront/app/api/cart/abandoned/route.ts` entirely:

```ts
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  IRAQ_GOVERNORATES,
  cartItemsSubtotal,
  normalizeIraqiMobile,
  type AbandonedCartItem,
  type GovernorateCode,
} from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp, consumeRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import { resolveStoreTenant } from "@/lib/route-guards";
import { storeKeyFromRequest } from "@/lib/store-host";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Half-filled phone capture. The storefront beacons this when a shopper
// has typed a valid phone on an order form and has not ordered yet. One
// live row per (tenant, phone). Staff work it from the orders «متروكة» tab.
// An automatic WhatsApp may only ever go to a row that carries consent_at.
//
// This route is unauthenticated by nature and writes with the service role,
// so everything it stores is decided here, not by the caller:
//   * the store comes from the request's host (lib/store-host), never from
//     the body, and must be publicly live. A draft-view session is the
//     merchant, so nothing is captured.
//   * every line must be one of that store's orderable products; its name
//     and unit price come from the catalogue.
//   * volume is bounded per IP and per (store, phone). This fails closed:
//     a row here can later drive a WhatsApp to that number, and when the
//     limiter cannot answer, the database behind this route cannot either.
//   * consent is recorded only when the caller sends the consent line the
//     shopper was shown, as consent_at + a version hash of that text.

const GOVERNORATE_CODES = IRAQ_GOVERNORATES.map((g) => g.code) as [
  GovernorateCode,
  ...GovernorateCode[],
];

/** Tenant statuses whose storefront is publicly live (as /api/events). */
const LIVE_TENANT_STATUSES: ReadonlySet<string> = new Set(["active", "trial"]);

/** A shopper editing the form beacons a handful of times. The per-IP cap is
 *  loose because Iraqi carriers put many shoppers behind one CGNAT address. */
const CAPTURE_WINDOW_SECONDS = 600;
const CAPTURE_LIMIT_PER_IP = 120;
const CAPTURE_LIMIT_PER_PHONE = 20;

// Names and prices are not read from the client. Zod strips any it sends.
const itemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(100),
});

const bodySchema = z.object({
  phone: z.string().min(1).max(40),
  items: z.array(itemSchema).min(1).max(50),
  governorate: z.enum(GOVERNORATE_CODES).optional().catch(undefined),
  locale: z.string().max(8).optional(),
  /** The consent line exactly as the shopper saw it under the phone field. */
  consent_text: z.string().trim().min(1).max(300).optional(),
});

type CaptureItem = z.infer<typeof itemSchema>;
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/** One stored line: the shared AbandonedCartItem shape the platform reads
 *  back. A type alias, not the interface itself, because only an object
 *  type literal is assignable to the jsonb `items` column's `Json` type
 *  (an interface has no implicit index signature, so `AbandonedCartItem[]`
 *  is rejected there). */
type CaptureLine = {
  product_id: AbandonedCartItem["product_id"];
  variant_id: string | null;
  name: AbandonedCartItem["name"];
  quantity: AbandonedCartItem["quantity"];
  price: AbandonedCartItem["price"];
};

/** "sha256:" + 16 hex of the consent line, so a capture can be matched to
 *  the config revision that rendered it. */
function consentVersion(text: string): string {
  return `sha256:${createHash("sha256").update(text.normalize("NFC")).digest("hex").slice(0, 16)}`;
}

/** Seconds to wait when the IP or the (store, phone) bucket is exhausted,
 *  else null. The phone is hashed so the limiter never holds a raw number. */
async function captureRateLimited(
  req: Request,
  tenantId: string,
  phone: string,
): Promise<number | null> {
  const phoneKey = createHash("sha256").update(`${tenantId}:${phone}`).digest("hex").slice(0, 32);
  // "unknown" only happens off the edge (local dev). One shared bucket for
  // every such caller would throttle them together, so it is skipped.
  const ip = clientIp(req.headers);
  const mode = "fail-closed";
  const checks = await Promise.all([
    ip !== "unknown"
      ? consumeRateLimit(`cart-capture:ip:${ip}`, CAPTURE_LIMIT_PER_IP, CAPTURE_WINDOW_SECONDS, mode)
      : null,
    consumeRateLimit(`cart-capture:phone:${phoneKey}`, CAPTURE_LIMIT_PER_PHONE, CAPTURE_WINDOW_SECONDS, mode),
  ]);
  const blocked = checks.filter((c): c is RateLimitResult => c !== null && !c.allowed);
  if (blocked.length === 0) return null;
  return Math.max(1, ...blocked.map((c) => c.retryAfterSeconds));
}

/** The lines that are this store's orderable products, named and priced
 *  from the catalogue (the variant's price, else the product's). It ignores
 *  quantity breaks: this is a lead record, not a charge. Null when the
 *  catalogue could not be read. */
async function catalogueLines(
  svc: ServiceClient,
  tenantId: string,
  items: CaptureItem[],
): Promise<CaptureLine[] | null> {
  const productIds = Array.from(new Set(items.map((i) => i.product_id)));
  const { data: products, error: productsErr } = await svc
    .from("products")
    .select("id, name, price, website_price, status, is_visible, is_archived, is_supply")
    .in("id", productIds)
    .eq("tenant_id", tenantId);
  if (productsErr || !products) {
    console.error("[cart/abandoned] product lookup failed:", productsErr);
    return null;
  }

  const variantIds = items
    .map((i) => i.variant_id)
    .filter((v): v is string => typeof v === "string");
  const variants = new Map<string, { product_id: string; price: number | null; is_enabled: boolean | null }>();
  if (variantIds.length > 0) {
    const { data: rows, error: variantsErr } = await svc
      .from("product_variants")
      .select("id, product_id, price, is_enabled")
      .in("id", variantIds)
      .eq("tenant_id", tenantId);
    if (variantsErr || !rows) {
      console.error("[cart/abandoned] variant lookup failed:", variantsErr);
      return null;
    }
    for (const v of rows) variants.set(v.id, v);
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: CaptureLine[] = [];
  for (const i of items) {
    const p = byId.get(i.product_id);
    if (!p || p.is_archived || p.status !== "active" || !p.is_visible || p.is_supply) continue;
    let unitPrice: number;
    if (i.variant_id) {
      const v = variants.get(i.variant_id);
      if (!v || v.product_id !== i.product_id || v.is_enabled === false) continue;
      unitPrice = Number(v.price ?? p.website_price ?? p.price) || 0;
    } else {
      unitPrice = Number(p.website_price ?? p.price) || 0;
    }
    if (unitPrice <= 0) continue;
    lines.push({
      product_id: p.id,
      variant_id: i.variant_id ?? null,
      name: p.name,
      quantity: i.quantity,
      price: unitPrice,
    });
  }
  return lines;
}

export async function POST(req: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cart" }, { status: 400 });
  }
  const { items, governorate, locale, consent_text } = parsed.data;

  // A malformed phone means we can never reach them. This is a silent
  // no-op, so the client beacon never surfaces an error.
  const phone = normalizeIraqiMobile(parsed.data.phone);
  if (!phone) {
    return NextResponse.json({ success: true, skipped: "phone" });
  }

  const storeKey = storeKeyFromRequest(req.headers);
  if (!storeKey) {
    return NextResponse.json({ error: "Unknown store" }, { status: 400 });
  }
  const tenant = await resolveStoreTenant(storeKey);
  if (!tenant || !LIVE_TENANT_STATUSES.has(tenant.status)) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404 });
  }
  if (tenant.is_draft_view) {
    return NextResponse.json({ success: true, skipped: "draft" });
  }

  const limited = await captureRateLimited(req, tenant.id, phone);
  if (limited !== null) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited) } },
    );
  }

  const service = createSupabaseServiceClient();
  const lines = await catalogueLines(service, tenant.id, items);
  if (lines === null) {
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
  if (lines.length === 0) {
    return NextResponse.json({ success: true, skipped: "items" });
  }

  const now = new Date().toISOString();
  // reminded_at, recovered_at and, for a capture without consent, the
  // consent columns are left out, so an update preserves them. A beacon
  // must never reset a cart that was already reminded or recovered, or
  // withdraw consent the shopper gave earlier. A fresh insert defaults
  // all of them to null.
  const { error } = await service.from("abandoned_carts").upsert(
    {
      tenant_id: tenant.id,
      phone,
      items: lines,
      subtotal_iqd: cartItemsSubtotal(lines),
      governorate: governorate ?? null,
      locale: locale ?? null,
      updated_at: now,
      ...(consent_text
        ? { consent_at: now, consent_text_version: consentVersion(consent_text) }
        : {}),
    },
    { onConflict: "tenant_id,phone" },
  );

  if (error) {
    console.error("[cart/abandoned] upsert failed:", error);
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Run it until it passes**

```bash
CI=true pnpm exec vitest run apps/storefront/app/api/cart/abandoned/route.test.ts apps/storefront/lib/draft-view-guards.test.tsx
```
Expected: PASS for both. The second file proves the fake-supabase change broke nothing.

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @scheniders/storefront type-check
```
Expected: exit 0. `items: lines` type-checks against the jsonb `Json` type because `CaptureLine` is a type alias; do not change it back to `AbandonedCartItem[]` (verified 2026-10-21: an interface array is rejected with TS2322 "Index signature for type 'string' is missing"). Never cast to `any`.

- [ ] **Step 7: Commit**

```bash
git add apps/storefront/lib/testing/fake-supabase.ts apps/storefront/app/api/cart/abandoned/route.ts apps/storefront/app/api/cart/abandoned/route.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "fix(storefront): cart capture takes the store from the host, rate-limits, records consent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.4: A real order marks the capture recovered (not for draft view, failure logged)

**Files:**
- Create: `apps/storefront/app/actions/checkout-abandoned-recovery.test.ts`
- Modify: `apps/storefront/app/actions/checkout.ts:736-744` as read before P1/P2 (after P1 it is about 12 lines lower, and P2.3 moves it again). Match on the anchor `// Abandoned-cart recovery: this phone just ordered`. P2's duplicate return and both replay returns sit above it, so a replay never marks a capture recovered. `draftView` (`const draftView = await isDraftViewRequest(tenant.id);`, line 690) and `orderId` (line 670) are already in scope there; P1 and P2 keep both names.

- [ ] **Step 1: Write the failing test** `apps/storefront/app/actions/checkout-abandoned-recovery.test.ts`

```ts
// =====================================================================
// A real storefront order marks that phone's open capture recovered:
// in its own store only, never twice, never for the merchant's draft-view
// test order. A failed write is logged and never fails the order. Whether
// the recovery came after a reminder is derived in the database
// (abandoned_carts.recovery_kind), so this code writes recovered_at only.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signPreviewToken } from "@scheniders/shared/preview-token";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({
  sendPurchaseCapi: vi.fn(),
}));
// P1's QStash hand-off runs in next/server `after`; it is not under test here.
vi.mock("@/lib/order-confirmation-queue", () => ({
  queueOrderConfirmation: vi.fn(),
}));

import { cookies, headers } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { submitCheckout } from "@/app/actions/checkout";
import { DRAFT_VIEW_COOKIE } from "@/lib/draft-view";
import { createFakeSupabase, type FakeSupabase, type Row } from "@/lib/testing/fake-supabase";

const TENANT_ID = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT_ID = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";
const PRODUCT_ID = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const ORDER_UUID = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";
const PHONE = "07701234567";
const SECRET = "test-preview-secret";

function jar(draftToken: string | undefined): void {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => {
      if (name === DRAFT_VIEW_COOKIE && draftToken !== undefined) return { name, value: draftToken };
      return undefined;
    },
  } as never);
  vi.mocked(headers).mockResolvedValue(new Headers() as never);
}

function install(carts: Row[], failingTables: string[] = []): FakeSupabase {
  const fake = createFakeSupabase(
    {
      tenants: [{ id: TENANT_ID, status: "active", restrictions: null, store_config_v2: null }],
      products: [
        {
          id: PRODUCT_ID,
          tenant_id: TENANT_ID,
          name: "P",
          short_name: null,
          price: 1000,
          website_price: null,
          status: "active",
          is_visible: true,
          is_archived: false,
          is_supply: false,
        },
      ],
      product_variants: [],
      product_tiered_pricing: [],
      product_order_bumps: [],
      abandoned_carts: carts,
      customer_points: [],
      orders: [],
    },
    {
      failingTables,
      rpc: {
        // P2.3 moved submitCheckout to the duplicate-guarded wrapper; P3 runs
        // after P2, so this is the RPC the checkout actually calls.
        create_storefront_order: () => ({
          data: { id: ORDER_UUID, order_id: "4261021001" },
          error: null,
        }),
      },
    },
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const checkout = () =>
  submitCheckout({
    tenantId: TENANT_ID,
    customer: {
      customer_name: "Ali Hassan",
      phone: PHONE,
      governorate_code: "BG",
      city: "Baghdad",
      address_details: "Street 14",
    },
    items: [
      { product_id: PRODUCT_ID, variant_id: null, name: "P", variant_name: null, price: 1000, quantity: 1 },
    ],
  });

const cart = (fake: FakeSupabase, tenantId: string): Row | undefined =>
  fake.tables.abandoned_carts.find((r) => r.tenant_id === tenantId && r.phone === PHONE);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PREVIEW_TOKEN_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("submitCheckout marks the phone's capture recovered", () => {
  it("in this store only", async () => {
    jar(undefined);
    const fake = install([
      { id: "own", tenant_id: TENANT_ID, phone: PHONE, recovered_at: null, reminded_at: null },
      { id: "other", tenant_id: OTHER_TENANT_ID, phone: PHONE, recovered_at: null, reminded_at: null },
    ]);
    const res = await checkout();
    expect(res.success).toBe(true);
    expect(typeof cart(fake, TENANT_ID)?.recovered_at).toBe("string");
    expect(cart(fake, OTHER_TENANT_ID)?.recovered_at).toBeNull();
  });

  it("keeps the first recovery time of a capture already recovered", async () => {
    jar(undefined);
    const fake = install([
      { id: "own", tenant_id: TENANT_ID, phone: PHONE, recovered_at: "2026-10-01T00:00:00.000Z", reminded_at: null },
    ]);
    await checkout();
    expect(cart(fake, TENANT_ID)?.recovered_at).toBe("2026-10-01T00:00:00.000Z");
  });

  it("recovers nothing for the merchant's draft-view test order", async () => {
    jar(signPreviewToken({ tenant_id: TENANT_ID }, SECRET, 600));
    const fake = install([
      { id: "own", tenant_id: TENANT_ID, phone: PHONE, recovered_at: null, reminded_at: null },
    ]);
    const res = await checkout();
    expect(res.success).toBe(true);
    expect(cart(fake, TENANT_ID)?.recovered_at).toBeNull();
    expect(fake.writes.filter((w) => w.table === "abandoned_carts")).toEqual([]);
  });

  it("logs a failed write with the order id and still places the order", async () => {
    jar(undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    install([], ["abandoned_carts"]);
    const res = await checkout();
    expect(res.success).toBe(true);
    expect(
      errorSpy.mock.calls.some(
        ([msg]) =>
          String(msg).includes("could not mark abandoned cart recovered") &&
          String(msg).includes(ORDER_UUID),
      ),
    ).toBe(true);
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
CI=true pnpm exec vitest run apps/storefront/app/actions/checkout-abandoned-recovery.test.ts
```
Expected: FAIL on 2 tests.
- "recovers nothing for the merchant's draft-view test order": `recovered_at` is a string, not null.
- "logs a failed write…": the spy never gets the message.

The other 2 tests already pass (characterization).

- [ ] **Step 3: Implement.** In `apps/storefront/app/actions/checkout.ts`, replace the block

```ts
  // Abandoned-cart recovery: this phone just ordered — mark any pending cart
  // recovered so the WhatsApp reminder sweep skips it. Best-effort: a failure
  // here must never fail the order.
  await supabase
    .from("abandoned_carts")
    .update({ recovered_at: new Date().toISOString() })
    .eq("tenant_id", payload.tenantId)
    .eq("phone", phone)
    .is("recovered_at", null);
```

with

```ts
  // Abandoned-cart recovery: this phone just ordered, so mark its open
  // capture recovered. The worklist then drops it and no reminder can go
  // out. Whether a reminder came first is derived in the database
  // (abandoned_carts.recovery_kind), so the split cannot drift from the
  // timestamps. A draft-view order is the merchant testing, not a buyer
  // coming back. Best-effort: a failure here must never fail the order,
  // so it is logged with the order id, not thrown.
  if (!draftView) {
    const { error: recoverErr } = await supabase
      .from("abandoned_carts")
      .update({ recovered_at: new Date().toISOString() })
      .eq("tenant_id", payload.tenantId)
      .eq("phone", phone)
      .is("recovered_at", null);
    if (recoverErr) {
      console.error(
        `[checkout] could not mark abandoned cart recovered for order ${orderId ?? "(no id)"}:`,
        recoverErr,
      );
    }
  }
```

- [ ] **Step 4: Run it, plus the checkout suites that share the double**

```bash
CI=true pnpm exec vitest run apps/storefront/app/actions/ apps/storefront/lib/draft-view-guards.test.tsx
```
Expected: PASS (all).

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @scheniders/storefront type-check
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/app/actions/checkout.ts apps/storefront/app/actions/checkout-abandoned-recovery.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "fix(storefront): draft-view orders recover no capture; log a failed recovery write" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.5: PDP consent line (classic) and the consent-gated capture beacon

**Files:**
- Modify: `packages/sections/src/pdp_direct_order.tsx:158-161` (end of `schema`, after `scroll_hint_i18n`)
- Modify: `packages/sections/src/pdp_direct_order.client.tsx`
  - `STRINGS`, after `inspectBeforePaying` (line 152)
  - the beacon effect at lines 585-626 (anchor `// Abandoned-cart capture: the direct-order form IS this store's checkout,`)
  - the classic phone field at lines 1484-1504 (anchor `{renderFieldError("phone")}`, line 1503, its only occurrence)
- Modify: `packages/sections/src/_customer-memory-forms.test.tsx:34-43` (`element()`) and `:94-117` (W5.4)
- Create: `packages/sections/src/_pdp-capture-consent.test.tsx`

- [ ] **Step 1: Write the failing test** `packages/sections/src/_pdp-capture-consent.test.tsx`

```tsx
// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order: half-filled phone capture, only with consent
// =====================================================================
// A phone typed on the product page is kept as a lead only where the
// merchant shows the consent line under the phone field (opt-in). Without
// the opt-in there is no line and no beacon, and the markup is unchanged.
// The beacon sends the line exactly as shown and never a tenant id, a
// price or a name: the server derives all of those. Nothing is beaconed
// while the order is being placed.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order, { type Props } from "./pdp_direct_order";
import { EXPRESS_IRAQ_PDP_PROPS, plainProduct, productCtx, productRuntime } from "./_pdp-fixtures";

const DEFAULT_AR = "ممكن نراسلك واتساب بخصوص طلبك";
const DEFAULT_EN = "We may message you on WhatsApp about your order";
const DEFAULT_KU = "لەوانەیە سەبارەت بە داواکارییەکەت لە واتسئاپ نامەت بۆ بنێرین";

function element(props: Partial<Props> = {}, locale: LocaleCode = "ar") {
  const Section = pdp_direct_order.render;
  return (
    <StoreBaseProvider base="">
      <Section
        props={{ ...pdp_direct_order.defaultProps, ...props }}
        ctx={productCtx(plainProduct, { runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>
  );
}

const fetchMock = vi.fn((url: string) =>
  url === "/api/checkout/orders"
    ? new Promise<Response>(() => undefined)
    : Promise.resolve(new Response("{}")),
);
const beacons = () => fetchMock.mock.calls.filter(([url]) => url === "/api/cart/abandoned");

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}
function typePhone(value = "07701234567"): void {
  const phone = q<HTMLInputElement>('input[name="phone"]');
  fireEvent.focus(phone);
  fireEvent.change(phone, { target: { value } });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("schema", () => {
  it("degrades a malformed opt-in instead of dropping the buy box", () => {
    const parsed = pdp_direct_order.schema.parse({
      ...pdp_direct_order.defaultProps,
      show_capture_consent: "yes",
      capture_consent_i18n: 7,
    });
    expect(parsed.show_capture_consent).toBeUndefined();
    expect(parsed.capture_consent_i18n).toBeUndefined();
  });
});

describe("without the opt-in", () => {
  it("renders no consent line and beacons nothing", () => {
    expect(renderToStaticMarkup(element())).not.toContain("data-capture-consent");
    render(element());
    typePhone();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(beacons()).toHaveLength(0);
  });
});

describe("with the opt-in (classic)", () => {
  it("shows the default line under the phone field in ar / en / ku", () => {
    for (const [locale, text] of [
      ["ar", DEFAULT_AR],
      ["en", DEFAULT_EN],
      ["ku", DEFAULT_KU],
    ] as const) {
      const html = renderToStaticMarkup(element({ show_capture_consent: true }, locale));
      expect(html).toContain("data-capture-consent");
      expect(html).toContain(text);
    }
  });

  it("shows the merchant's own wording when set", () => {
    const html = renderToStaticMarkup(
      element({ show_capture_consent: true, capture_consent_i18n: { ar: "نراسلك بخصوص طلبك فقط" } }),
    );
    expect(html).toContain("نراسلك بخصوص طلبك فقط");
    expect(html).not.toContain(DEFAULT_AR);
  });

  it("beacons the phone with the line as shown, and no tenant id, name or price", () => {
    render(element({ show_capture_consent: true }));
    expect(q("[data-capture-consent]").textContent).toBe(DEFAULT_AR);
    typePhone();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(beacons()).toHaveLength(1);
    const [, init] = beacons()[0] as unknown as [string, RequestInit];
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({
      phone: "07701234567",
      items: [{ product_id: plainProduct.id, variant_id: null, quantity: 1 }],
      locale: "ar",
      consent_text: DEFAULT_AR,
    });
  });

  it("beacons nothing once the order is being placed", () => {
    render(element({ show_capture_consent: true }));
    typePhone();
    fireEvent.change(q<HTMLInputElement>('input[name="name"]'), { target: { value: "علي" } });
    fireEvent.change(q<HTMLSelectElement>('select[name="governorate"]'), { target: { value: "BG" } });
    fireEvent.change(q<HTMLTextAreaElement>('[name="address"]'), { target: { value: "الكرادة" } });
    act(() => {
      fireEvent.submit(q<HTMLFormElement>("form"));
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/checkout/orders")).toHaveLength(1);
    expect(beacons()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-capture-consent.test.tsx
```
Expected:
- FAIL: "without the opt-in … beacons nothing", because main's beacon fires.
- FAIL: every "with the opt-in" case, because there is no `data-capture-consent`.
- PASS already: the schema case, because `z.object` strips the not-yet-declared keys. It is kept as the guard that, once Step 3 declares them, a malformed value degrades through `.catch` instead of rejecting the whole buy box.

- [ ] **Step 3: Add the schema fields.** In `packages/sections/src/pdp_direct_order.tsx`, directly after

```ts
  /** Express: the scroll hint's text. Empty = the generic chrome line. */
  scroll_hint_i18n: i18nStringOptional.catch(undefined),
```
insert (still inside `z.object({ … })`):
```ts

  // ── Half-filled phone capture (opt-in, both layouts) ─────────────────
  /** When true, a consent line renders under the phone field. Only then is
   *  a valid phone the shopper typed kept as a lead (with the exact line
   *  they saw) if they leave without ordering. Staff see it in the orders
   *  «متروكة» tab. Absent/false = no line and no capture, byte-identical
   *  for every existing config. */
  show_capture_consent: z.boolean().optional().catch(undefined),
  /** The consent line. Empty = the default chrome line
   *  («ممكن نراسلك واتساب بخصوص طلبك»). Editing it changes the
   *  consent_text_version recorded with each new capture. */
  capture_consent_i18n: i18nStringOptional.catch(undefined),
```

- [ ] **Step 4: Add the chrome string.** In `packages/sections/src/pdp_direct_order.client.tsx`, directly after the `inspectBeforePaying: { … },` entry of `STRINGS` (line 152), add:

```ts
  /** Default consent line under the phone field (`show_capture_consent`). */
  captureConsent: {
    en: "We may message you on WhatsApp about your order",
    ar: "ممكن نراسلك واتساب بخصوص طلبك",
    ku: "لەوانەیە سەبارەت بە داواکارییەکەت لە واتسئاپ نامەت بۆ بنێرین",
  },
```

- [ ] **Step 5: Gate the beacon on consent.** In the same file, replace everything from the line `  // Abandoned-cart capture: the direct-order form IS this store's checkout,` through the closing `  ]);` of that `useEffect` (lines 585-626 before P2; P2.7 adds a restore and a persist effect above it, so it now starts lower, match on the comment text) with the block below. `status` is P2's `SubmitStatus` (`idle | submitting | checking | ok | duplicate | unconfirmed | error`). The gate lets only `idle` and `error` through. `error` is P2's "nothing was placed" outcome. `checking` is the in-flight resend, and `unconfirmed` may already have placed the order, so both are kept out on purpose:

```tsx
  // Half-filled phone capture: the direct-order form IS this store's
  // checkout. A phone is kept only where the merchant shows the consent line
  // under the phone field (opt-in). Once the shopper has touched the form
  // and typed a valid Iraqi number, the line is beaconed: debounced,
  // best-effort (keepalive), with the consent line exactly as shown. The
  // server works out the store from the request and the names and prices
  // from the catalogue, so neither is sent. Nothing is beaconed while the
  // order is being placed or once it was. Placing it marks the capture
  // recovered.
  const captureConsent =
    props.show_capture_consent === true
      ? resolveI18n(props.capture_consent_i18n, locale) || s("captureConsent")
      : null;
  useEffect(() => {
    if (!captureConsent || !interacted) return;
    if (status !== "idle" && status !== "error") return;
    const recoveryPhone = normalizeIraqiMobile(form.phone);
    if (!recoveryPhone) return;
    const handle = setTimeout(() => {
      fetch("/api/cart/abandoned", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          phone: recoveryPhone,
          items: [{ product_id: product.id, variant_id: chosenVariantId, quantity: qty }],
          ...(form.governorate_code ? { governorate: form.governorate_code } : {}),
          locale,
          consent_text: captureConsent,
        }),
      }).catch((error: unknown) => {
        // Best-effort: a lost beacon only costs one lead, so it must never
        // surface to the shopper. But it is not silent either.
        console.warn("[pdp_direct_order] capture beacon failed", error);
      });
    }, 1500);
    return () => clearTimeout(handle);
  }, [
    captureConsent,
    interacted,
    status,
    form.phone,
    form.governorate_code,
    product.id,
    chosenVariantId,
    qty,
    locale,
  ]);
```

- [ ] **Step 6: Render the line under the classic phone field.** In the same file, inside the classic phone `<div>` (anchor: the `{renderFieldError("phone")}` that directly follows the `name="phone"` input's closing `</IconField>`, around line 1503), replace

```tsx
                {renderFieldError("phone")}
              </div>
```
(the only `renderFieldError("phone")` in the file, the phone block) with
```tsx
                {renderFieldError("phone")}
                {captureConsent && (
                  <p
                    data-capture-consent=""
                    data-i18n-field="capture_consent_i18n"
                    className="mt-bk-2xs font-label text-xs text-bk-ink-faint"
                  >
                    {captureConsent}
                  </p>
                )}
              </div>
```

- [ ] **Step 7: Move the existing W5.4 beacon test to the new contract.** In `packages/sections/src/_customer-memory-forms.test.tsx`:
- Replace `element()` (lines 34-43) with:
```tsx
function element(props: Partial<typeof pdp_direct_order.defaultProps> = {}) {
  return React.createElement(
    StoreBaseProvider,
    { base: "", children: null },
    React.createElement(pdp_direct_order.render, {
      props: { ...pdp_direct_order.defaultProps, ...props },
      ctx: { tenant: tenant as never, runtime, products: [], categories: [], product },
    }),
  );
}
```
- Replace the whole `describe("pdp_direct_order abandoned-cart beacon (W5.4)", …)` block (lines 94-117) with:
```tsx
describe("pdp_direct_order abandoned-cart beacon (W5.4)", () => {
  it("does not beacon a remembered phone until the shopper touches the form", () => {
    vi.useFakeTimers();
    writeCustomerMemory(TENANT, { customer_name: "زبون-تجريبي-٩٩", phone: "07701234567", governorate_code: "BG", address_details: "x" });
    render(element({ show_capture_consent: true }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.focus(document.querySelector('input[name="phone"]') as HTMLInputElement);
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/cart/abandoned");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("tenant_id");
    expect(body.phone).toBe("07701234567");
    expect(body.governorate).toBe("BG");
    expect(body.consent_text).toBe("ممكن نراسلك واتساب بخصوص طلبك");
    expect(body.items).toEqual([{ product_id: product.id, variant_id: null, quantity: 1 }]);
  });

  it("beacons nothing for a store that does not show the consent line", () => {
    vi.useFakeTimers();
    writeCustomerMemory(TENANT, { customer_name: "زبون-تجريبي-٩٩", phone: "07701234567", governorate_code: "BG", address_details: "x" });
    render(element());
    fireEvent.focus(document.querySelector('input[name="phone"]') as HTMLInputElement);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run the new and affected tests, plus the snapshot and Kurdish guards**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-capture-consent.test.tsx packages/sections/src/_customer-memory-forms.test.tsx packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-form.test.tsx
```
Expected: PASS (all). The classic snapshot stays unchanged, because the opt-in is absent from every fixture.

- [ ] **Step 9: Type-check (storefront compiles the sections source)**

```bash
pnpm --filter @scheniders/storefront type-check
```
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/sections/src/pdp_direct_order.tsx packages/sections/src/pdp_direct_order.client.tsx packages/sections/src/_customer-memory-forms.test.tsx packages/sections/src/_pdp-capture-consent.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): PDP phone capture only behind a merchant-editable consent line" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.6: The consent line in the express layout

**Files:**
- Modify: `packages/sections/src/pdp_express/model.ts:103-104` (add the field after `trustChips`, the last member of `ExpressModel`)
- Modify: `packages/sections/src/pdp_direct_order.client.tsx:1224` (anchor: `trustChips,` inside the `<PdpExpress model={{ … }}>` object)
- Modify: `packages/sections/src/pdp_express/express-form.tsx:326-342` (anchor: the `) : null}` that ends the phone message/hint block, before the phone block's closing `</div>`)
- Modify: `packages/sections/src/_pdp-capture-consent.test.tsx` (append an express `describe`)

- [ ] **Step 1: Write the failing test.** Append to `packages/sections/src/_pdp-capture-consent.test.tsx`:

```tsx
describe("with the opt-in (express)", () => {
  function mountExpress(props: Partial<Props> = {}) {
    const Section = pdp_direct_order.render;
    return render(
      <StoreBaseProvider base="/s/fixture-store">
        <Section props={{ ...EXPRESS_IRAQ_PDP_PROPS, ...props }} ctx={productCtx(plainProduct)} />
      </StoreBaseProvider>,
    );
  }

  it("renders no line without the opt-in (express default unchanged)", () => {
    mountExpress();
    expect(document.querySelector("[data-capture-consent]")).toBeNull();
  });

  it("shows the line inside the phone block and beacons with it", () => {
    mountExpress({ show_capture_consent: true });
    const phone = q<HTMLInputElement>('input[name="phone"]');
    const phoneBlock = phone.closest("div")?.parentElement;
    expect(phoneBlock?.querySelector("[data-capture-consent]")?.textContent).toBe(DEFAULT_AR);

    typePhone();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(beacons()).toHaveLength(1);
    const [, init] = beacons()[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { phone: string; consent_text: string };
    expect(body.phone).toBe("07701234567");
    expect(body.consent_text).toBe(DEFAULT_AR);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-capture-consent.test.tsx
```
Expected: FAIL in "shows the line inside the phone block and beacons with it". `textContent` is `undefined`, because express does not render the line yet. The beacon assertions would pass, since the effect is shared.

- [ ] **Step 3: Add the line to the express model.** (Build order is P1 → P2 → P3 → P4 → P5. P2 added `waFallbackHref` right after `waHref`, in both the interface and the `model={{ … }}` object, so `trustChips` is still the last member here. P4 runs later and puts `contactConfig` next to `reassurance`, so it does not touch this anchor.) In `packages/sections/src/pdp_express/model.ts`, replace

```ts
  trustChips: NonNullable<Props["trust_chips"]>;
}
```
with
```ts
  trustChips: NonNullable<Props["trust_chips"]>;
  /** The consent line under the phone field, or null when the merchant has
   *  not opted in to half-filled phone capture. */
  captureConsent: string | null;
}
```

- [ ] **Step 4: Pass it.** In `packages/sections/src/pdp_direct_order.client.tsx`, inside `<PdpExpress model={{ … }} />`, replace

```tsx
          trustChips,
        }}
```
with
```tsx
          trustChips,
          captureConsent,
        }}
```

- [ ] **Step 5: Render it.** In `packages/sections/src/pdp_express/express-form.tsx`, replace the end of the phone block

```tsx
            <span>{xs("phoneNextHint", locale)}</span>
          </p>
        ) : null}
      </div>
```
with
```tsx
            <span>{xs("phoneNextHint", locale)}</span>
          </p>
        ) : null}
        {m.captureConsent && (
          <p
            data-capture-consent=""
            data-i18n-field="capture_consent_i18n"
            className="mt-1 font-bk-body text-xs text-bk-ink-faint"
          >
            {m.captureConsent}
          </p>
        )}
      </div>
```

- [ ] **Step 6: Run the express suites and the snapshot**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-capture-consent.test.tsx packages/sections/src/_pdp-express-form.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-express-cta.test.tsx packages/sections/src/_pdp-express-trust.test.tsx
```
Expected: PASS (all). The express snapshot is unchanged.

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @scheniders/storefront type-check
```
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/sections/src/pdp_express/model.ts packages/sections/src/pdp_express/express-form.tsx packages/sections/src/pdp_direct_order.client.tsx packages/sections/src/_pdp-capture-consent.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): consent line under the express phone field" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.7: Store captures inside the orders «متروكة» tab (tenant-scoped read, `pending_checkout` untouched)

**Files:**
- Create: `apps/platform/hooks/use-open-store-captures.ts`
- Create: `apps/platform/hooks/use-open-store-captures.test.tsx`
- Create: `apps/platform/components/orders/store-captures-panel.tsx`
- Create: `apps/platform/components/orders/store-captures-panel.test.tsx`
- Modify: `apps/platform/lib/i18n.ts:321` (en, after `"orders.status.unknown": "Unknown",`) and `:3661` (ar, after `"orders.status.unknown": "غير معروف",`)
- Modify: `apps/platform/app/orders/page.tsx:66-69` (add a dynamic import after `IraqMap`) and `:1733` (anchor: `{/* While searching, the list is a lookup across every date and status. */}`)

- [ ] **Step 1: Write the failing hook test** `apps/platform/hooks/use-open-store-captures.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const H = vi.hoisted(() => ({
  calls: [] as unknown[][],
  result: { data: [] as unknown[] | null, error: null as { message: string } | null },
  tenantId: "tenant-1" as string | null,
}));

vi.mock("@/lib/supabase", () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ["select", "eq", "is", "order"]) {
    chain[m] = (...args: unknown[]) => {
      H.calls.push([m, ...args]);
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    H.calls.push(["limit", ...args]);
    return Promise.resolve(H.result);
  };
  return {
    supabase: {
      from: (table: string) => {
        H.calls.push(["from", table]);
        return chain;
      },
    },
  };
});
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ tenantId: H.tenantId }),
}));

import { useOpenStoreCaptures, OPEN_CAPTURES_LIMIT } from "./use-open-store-captures";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  H.calls = [];
  H.result = { data: [], error: null };
  H.tenantId = "tenant-1";
});

describe("useOpenStoreCaptures", () => {
  it("reads this tenant's open captures only, newest first", async () => {
    H.result = {
      data: [
        {
          id: "c1",
          phone: "07701234567",
          items: [{ product_id: "p1", variant_id: null, name: "عطر", quantity: 1, price: 25000 }],
          subtotal_iqd: 25000,
          governorate: "BG",
          updated_at: "2026-10-21T10:00:00.000Z",
          consent_at: "2026-10-21T10:00:00.000Z",
          reminded_at: null,
        },
        {
          id: "c2",
          phone: "07801234567",
          items: "corrupt",
          subtotal_iqd: 0,
          governorate: null,
          updated_at: "2026-10-21T09:00:00.000Z",
          consent_at: null,
          reminded_at: null,
        },
      ],
      error: null,
    };
    const { result } = renderHook(() => useOpenStoreCaptures(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(H.calls).toContainEqual(["from", "abandoned_carts"]);
    expect(H.calls).toContainEqual(["eq", "tenant_id", "tenant-1"]);
    expect(H.calls).toContainEqual(["is", "recovered_at", null]);
    expect(H.calls).toContainEqual(["order", "updated_at", { ascending: false }]);
    expect(H.calls).toContainEqual(["limit", OPEN_CAPTURES_LIMIT]);
    expect(result.current.data?.[1].items).toEqual([]);
  });

  it("does not query before the active tenant is known", async () => {
    H.tenantId = null;
    renderHook(() => useOpenStoreCaptures(), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 20));
    expect(H.calls).toEqual([]);
  });

  it("surfaces a read error instead of an empty list", async () => {
    H.result = { data: null, error: { message: "boom" } };
    const { result } = renderHook(() => useOpenStoreCaptures(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Write the failing panel test** `apps/platform/components/orders/store-captures-panel.test.tsx`

```tsx
/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const H = vi.hoisted(() => ({
  state: { data: [] as unknown[], isError: false },
}));

vi.mock("@/hooks/use-open-store-captures", () => ({
  useOpenStoreCaptures: () => H.state,
}));
vi.mock("@/hooks/use-language", async () => {
  const { translations } = await import("@/lib/i18n");
  return {
    useLanguage: () => ({
      language: "ar",
      setLanguage: () => undefined,
      t: (key: string) => translations.ar[key] ?? key,
    }),
  };
});

import { translations } from "@/lib/i18n";
import { StoreCapturesPanel } from "./store-captures-panel";

afterEach(() => {
  cleanup();
  H.state = { data: [], isError: false };
});

const consented = {
  id: "c1",
  phone: "07701234567",
  items: [{ product_id: "p1", variant_id: null, name: "عطر تجريبي", quantity: 2, price: 12500 }],
  subtotal_iqd: 25000,
  governorate: "BG",
  updated_at: "2026-10-21T10:00:00.000Z",
  consent_at: "2026-10-21T10:00:00.000Z",
  reminded_at: null,
};
const unconsented = { ...consented, id: "c2", phone: "07801234567", consent_at: null };

describe("StoreCapturesPanel", () => {
  it("renders nothing while there are no open captures, so the tab is unchanged", () => {
    const { container } = render(<StoreCapturesPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("lists each capture with a call link, the product, the amount and its consent", () => {
    H.state = { data: [consented, unconsented], isError: false };
    render(<StoreCapturesPanel />);
    expect(screen.getByTestId("store-captures").textContent).toContain(translations.ar["orders.captures.title"]);
    expect(screen.getByText(translations.ar["orders.captures.hint"])).toBeTruthy();
    const rows = screen.getAllByTestId("store-capture");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('a[href="tel:07701234567"]')).not.toBeNull();
    expect(rows[0].textContent).toContain("عطر تجريبي × 2");
    expect(rows[0].textContent).toContain("25,000");
    expect(rows[0].textContent).toContain(translations.ar["orders.captures.consent"]);
    expect(rows[1].textContent).toContain(translations.ar["orders.captures.noConsent"]);
  });

  it("says so when the read failed", () => {
    H.state = { data: [], isError: true };
    render(<StoreCapturesPanel />);
    expect(screen.getByRole("alert").textContent).toBe(translations.ar["orders.captures.loadFailed"]);
  });
});
```

- [ ] **Step 3: Run both and watch them fail**

```bash
CI=true pnpm exec vitest run apps/platform/hooks/use-open-store-captures.test.tsx apps/platform/components/orders/store-captures-panel.test.tsx
```
Expected: FAIL. Neither `./use-open-store-captures` nor `./store-captures-panel` can be resolved.

- [ ] **Step 4: Implement the hook** `apps/platform/hooks/use-open-store-captures.ts`

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import type { AbandonedCartItem } from "@scheniders/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

export interface StoreCaptureRow {
    id: string;
    phone: string;
    items: AbandonedCartItem[];
    subtotal_iqd: number;
    governorate: string | null;
    updated_at: string;
    /** Set when the buyer typed the phone with the consent line shown. */
    consent_at: string | null;
    reminded_at: string | null;
}

/** The worklist shows the newest open captures; the full history is on
 *  /store/recovery. */
export const OPEN_CAPTURES_LIMIT = 100;

/**
 * Open store captures for the active tenant: phones typed on the store's
 * order form with no order from that phone since. Newest first.
 *
 * It is tenant-scoped twice: by the explicit filter here, and by the
 * member-SELECT RLS policy on abandoned_carts underneath it. It is
 * read-only, because writes to abandoned_carts are service-role only.
 */
export function useOpenStoreCaptures() {
    const { tenantId } = useAuth();
    return useQuery<StoreCaptureRow[]>({
        queryKey: ["store-captures-open", tenantId],
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase
                .from("abandoned_carts")
                .select(
                    "id, phone, items, subtotal_iqd, governorate, updated_at, consent_at, reminded_at",
                )
                .eq("tenant_id", tenantId)
                .is("recovered_at", null)
                .order("updated_at", { ascending: false })
                .limit(OPEN_CAPTURES_LIMIT);
            if (error) throw error;
            const rows = (data ?? []) as unknown as Array<
                Omit<StoreCaptureRow, "items"> & { items: unknown }
            >;
            return rows.map((r) => ({
                ...r,
                items: Array.isArray(r.items) ? (r.items as AbandonedCartItem[]) : [],
            }));
        },
    });
}
```

- [ ] **Step 5: Implement the panel** `apps/platform/components/orders/store-captures-panel.tsx`

```tsx
"use client";

import { Badge } from "@scheniders/ui";
import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useOpenStoreCaptures } from "@/hooks/use-open-store-captures";

/**
 * Store captures in the orders «متروكة» tab: phones a shopper typed on the
 * store's order form without placing the order. They live in
 * abandoned_carts, not in orders, so the pending_checkout rows beside them,
 * and those rows' statuses and counts, stay exactly as they were. Staff
 * call or message these by hand; nothing here sends anything. The panel
 * renders nothing while there are no open captures, so the tab looks
 * unchanged for every store that has none.
 */
export function StoreCapturesPanel() {
    const { t, language } = useLanguage();
    const { data: captures = [], isError } = useOpenStoreCaptures();

    if (isError) {
        return (
            <p
                role="alert"
                className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
            >
                {t("orders.captures.loadFailed")}
            </p>
        );
    }
    if (captures.length === 0) return null;

    const when = new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-GB", {
        timeZone: "Asia/Baghdad",
        dateStyle: "medium",
        timeStyle: "short",
    });

    return (
        <section
            data-testid="store-captures"
            aria-labelledby="store-captures-title"
            className="rounded-2xl border border-border bg-card p-4"
        >
            <h2 id="store-captures-title" className="text-sm font-bold text-foreground">
                {t("orders.captures.title")}{" "}
                <span className="tabular-nums text-muted-foreground">({captures.length})</span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("orders.captures.hint")}</p>
            <ul className="mt-3 space-y-2">
                {captures.map((c) => {
                    const governorate = c.governorate
                        ? IRAQ_GOVERNORATES.find((g) => g.code === c.governorate)
                        : undefined;
                    return (
                        <li
                            key={c.id}
                            data-testid="store-capture"
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <a
                                        href={`tel:${c.phone}`}
                                        dir="ltr"
                                        className="font-medium tabular-nums text-foreground underline-offset-2 hover:underline"
                                    >
                                        {c.phone}
                                    </a>
                                    <Badge variant={c.consent_at ? "contacted" : "default"}>
                                        {c.consent_at
                                            ? t("orders.captures.consent")
                                            : t("orders.captures.noConsent")}
                                    </Badge>
                                </div>
                                <p className="mt-1 truncate text-sm text-muted-foreground">
                                    {c.items
                                        .map((i) => `${i.name} × ${i.quantity}`)
                                        .join(t("orders.captures.itemSeparator"))}
                                    {governorate
                                        ? ` · ${language === "ar" ? governorate.name : governorate.name_en}`
                                        : ""}
                                </p>
                            </div>
                            <div className="text-end">
                                <p className="font-bold tabular-nums text-foreground">
                                    {formatIQD(c.subtotal_iqd)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {when.format(new Date(c.updated_at))}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
```

- [ ] **Step 6: Add the strings (en and ar, parity kept).** In `apps/platform/lib/i18n.ts`:
- After line 321, `        "orders.status.unknown": "Unknown",`, insert:
```ts
        "orders.captures.title": "Typed a phone in your store, didn't order",
        "orders.captures.hint": "Phones shoppers typed on your store's order form without placing the order. Call or message them yourself — nothing is sent automatically.",
        "orders.captures.consent": "OK'd WhatsApp",
        "orders.captures.noConsent": "No WhatsApp consent",
        "orders.captures.loadFailed": "Couldn't load the store-form phones.",
        "orders.captures.itemSeparator": ", ",
```
- After `        "orders.status.unknown": "غير معروف",` (line 3661 before the insert above; it moves down by 6), insert:
```ts
        "orders.captures.title": "كتبوا رقمهم بالمتجر وما كمّلوا الطلب",
        "orders.captures.hint": "أرقام كتبها زبائن بفورم الطلب بالمتجر بدون ما يثبّتون الطلب. اتصل أو راسلهم بنفسك — ما ينرسل شي تلقائياً.",
        "orders.captures.consent": "وافق على واتساب",
        "orders.captures.noConsent": "بدون موافقة واتساب",
        "orders.captures.loadFailed": "تعذّر تحميل أرقام فورم المتجر.",
        "orders.captures.itemSeparator": "، ",
```

- [ ] **Step 7: Wire the panel into the Abandoned tab only.** In `apps/platform/app/orders/page.tsx`:
- After the `const IraqMap = dynamic(…);` statement (lines 66-69), add:
```tsx
const StoreCapturesPanel = dynamic(
    () => import("@/components/orders/store-captures-panel").then(mod => ({ default: mod.StoreCapturesPanel })),
    { ssr: false, loading: () => null }
);
```
- Directly before the line `                                    {/* While searching, the list is a lookup across every date and status. */}`, insert:
```tsx
                                    {/* Store-form phones (abandoned_carts) sit beside, never inside,
                                        the pending_checkout rows: those rows, their statuses and their
                                        counts stay exactly as they are. Abandoned tab only. */}
                                    {filters.status === "pending_checkout" && !showArchived && <StoreCapturesPanel />}
```

- [ ] **Step 8: Run the new tests and the i18n guards**

```bash
CI=true pnpm exec vitest run apps/platform/hooks/use-open-store-captures.test.tsx apps/platform/components/orders/store-captures-panel.test.tsx apps/platform/lib/i18n-parity.test.ts apps/platform/lib/i18n-orders-keys.test.ts
```
Expected: PASS (all).

- [ ] **Step 9: Type-check**

```bash
pnpm --filter @scheniders/platform type-check
```
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/platform/hooks/use-open-store-captures.ts apps/platform/hooks/use-open-store-captures.test.tsx apps/platform/components/orders/store-captures-panel.tsx apps/platform/components/orders/store-captures-panel.test.tsx apps/platform/lib/i18n.ts apps/platform/app/orders/page.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(platform): store-form phone captures in the orders Abandoned tab" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.8: Split "recovered" into after-reminder vs organic

**Files:**
- Modify (full rewrite): `apps/platform/lib/recovery-stats.ts` (lines 1-56)
- Modify: `apps/platform/lib/recovery-stats.test.ts` (the `summarizeRecovery` describe)
- Modify (full rewrite): `apps/platform/hooks/use-abandoned-carts.ts` (lines 1-44)
- Modify (full rewrite): `apps/platform/app/store/recovery/page.tsx` (lines 1-118). Every string on it is hardcoded English today; since this task changes its cards and copy, the whole page moves onto `t()` instead of adding more hardcoded strings.
- Modify: `apps/platform/lib/i18n.ts` (en and ar `recovery.*` keys, directly after the `orders.captures.*` keys Task P3.7 added)

- [ ] **Step 1: Write the failing test.** Replace the `describe("summarizeRecovery", …)` block of `apps/platform/lib/recovery-stats.test.ts` with:

```ts
describe("summarizeRecovery", () => {
    it("tallies states + recovered value + rate, splitting recovered by how it came back", () => {
        const s = summarizeRecovery([
            { reminded_at: null, recovered_at: null, subtotal_iqd: 1000, recovery_kind: null },
            { reminded_at: "t", recovered_at: null, subtotal_iqd: 2000, recovery_kind: null },
            { reminded_at: "t", recovered_at: "t", subtotal_iqd: 3000, recovery_kind: "after_reminder" },
            { reminded_at: null, recovered_at: "t", subtotal_iqd: 5000, recovery_kind: "organic" },
        ]);
        expect(s.total).toBe(4);
        expect(s.pending).toBe(1);
        expect(s.reminded).toBe(1);
        expect(s.recovered).toBe(2);
        expect(s.recoveredAfterReminder).toBe(1);
        expect(s.recoveredOrganic).toBe(1);
        expect(s.recoveredValue).toBe(8000);
        expect(s.recoveryRate).toBe(0.5);
    });

    it("never credits a reminder without the database saying one came first", () => {
        const s = summarizeRecovery([
            { reminded_at: null, recovered_at: "t", subtotal_iqd: 1000, recovery_kind: null },
        ]);
        expect(s.recoveredAfterReminder).toBe(0);
        expect(s.recoveredOrganic).toBe(1);
    });

    it("is empty-safe", () => {
        expect(summarizeRecovery([])).toMatchObject({
            total: 0,
            recoveryRate: 0,
            recoveredAfterReminder: 0,
            recoveredOrganic: 0,
        });
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
CI=true pnpm exec vitest run apps/platform/lib/recovery-stats.test.ts
```
Expected: FAIL. `recoveredAfterReminder` and `recoveredOrganic` are `undefined`.

- [ ] **Step 3: Implement.** Replace `apps/platform/lib/recovery-stats.ts` entirely:

```ts
// Abandoned-cart recovery — dashboard state + stats.

export type CartState = "pending" | "reminded" | "recovered";

/** How a recovered capture came back. Derived in the database
 *  (abandoned_carts.recovery_kind) from the two timestamps: a reminder went
 *  out before the order, or the shopper ordered on their own. */
export type RecoveryKind = "after_reminder" | "organic";

export function cartState(c: {
    reminded_at: string | null;
    recovered_at: string | null;
}): CartState {
    if (c.recovered_at) return "recovered";
    if (c.reminded_at) return "reminded";
    return "pending";
}

export interface RecoveryStats {
    total: number;
    pending: number;
    reminded: number;
    recovered: number;
    /** Recovered after a reminder went out: the only ones a reminder can claim. */
    recoveredAfterReminder: number;
    /** Recovered with no reminder before the order. */
    recoveredOrganic: number;
    /** Summed subtotal (IQD) of recovered carts. */
    recoveredValue: number;
    /** recovered / total, in [0,1]. */
    recoveryRate: number;
}

export function summarizeRecovery(
    carts: ReadonlyArray<{
        reminded_at: string | null;
        recovered_at: string | null;
        subtotal_iqd: number;
        recovery_kind: RecoveryKind | null;
    }>,
): RecoveryStats {
    let pending = 0;
    let reminded = 0;
    let recovered = 0;
    let recoveredAfterReminder = 0;
    let recoveredOrganic = 0;
    let recoveredValue = 0;
    for (const c of carts) {
        const s = cartState(c);
        if (s === "recovered") {
            recovered += 1;
            recoveredValue += Math.max(0, c.subtotal_iqd);
            // Only the database's verdict credits a reminder. Anything else is
            // counted as the shopper coming back on their own.
            if (c.recovery_kind === "after_reminder") recoveredAfterReminder += 1;
            else recoveredOrganic += 1;
        } else if (s === "reminded") {
            reminded += 1;
        } else {
            pending += 1;
        }
    }
    const total = carts.length;
    return {
        total,
        pending,
        reminded,
        recovered,
        recoveredAfterReminder,
        recoveredOrganic,
        recoveredValue,
        recoveryRate: total > 0 ? recovered / total : 0,
    };
}
```

- [ ] **Step 4: Read the new columns.** Replace `apps/platform/hooks/use-abandoned-carts.ts` entirely:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { AbandonedCartItem } from "@scheniders/shared";
import type { RecoveryKind } from "@/lib/recovery-stats";

export interface AbandonedCartRow {
    id: string;
    phone: string;
    items: AbandonedCartItem[];
    subtotal_iqd: number;
    governorate: string | null;
    updated_at: string;
    reminded_at: string | null;
    recovered_at: string | null;
    consent_at: string | null;
    recovery_kind: RecoveryKind | null;
}

function recoveryKind(v: unknown): RecoveryKind | null {
    return v === "after_reminder" || v === "organic" ? v : null;
}

/** Captured carts for the current tenant (member RLS scopes rows). */
export function useAbandonedCarts() {
    const { tenantId } = useAuth();
    return useQuery<AbandonedCartRow[]>({
        queryKey: ["abandoned-carts", tenantId],
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data, error } = await supabase
                .from("abandoned_carts")
                .select(
                    "id, phone, items, subtotal_iqd, governorate, updated_at, reminded_at, recovered_at, consent_at, recovery_kind",
                )
                .eq("tenant_id", tenantId)
                .order("updated_at", { ascending: false })
                .limit(200);
            if (error) throw error;
            const rows = (data ?? []) as unknown as Array<
                Omit<AbandonedCartRow, "items" | "recovery_kind"> & {
                    items: unknown;
                    recovery_kind: unknown;
                }
            >;
            return rows.map((r) => ({
                ...r,
                items: Array.isArray(r.items) ? (r.items as AbandonedCartItem[]) : [],
                recovery_kind: recoveryKind(r.recovery_kind),
            }));
        },
    });
}
```

- [ ] **Step 5: Add the page's strings (en and ar, parity kept).** In `apps/platform/lib/i18n.ts`:
- In the en block, directly after `        "orders.captures.itemSeparator": ", ",` (added in Task P3.7), insert:
```ts
        "recovery.title": "Cart recovery",
        "recovery.subtitle": "Carts customers started but didn't complete. Placing the order marks it recovered — after a reminder, or on their own.",
        "recovery.cards.captured": "Captured",
        "recovery.cards.reminded": "Reminded",
        "recovery.cards.recoveredAfterReminder": "Recovered after reminder",
        "recovery.cards.recoveredOrganic": "Recovered on their own",
        "recovery.cards.rate": "Recovery rate",
        "recovery.cards.value": "Recovered value",
        "recovery.state.pending": "Pending",
        "recovery.state.reminded": "Reminded",
        "recovery.state.recovered": "Recovered",
        "recovery.loading": "Loading…",
        "recovery.empty": "No abandoned carts yet.",
        "recovery.items": "{count} item(s): {names}",
```
- In the ar block, directly after `        "orders.captures.itemSeparator": "، ",`, insert:
```ts
        "recovery.title": "استرجاع السلات",
        "recovery.subtitle": "سلات بدأها الزبائن وما كمّلوها. تثبيت الطلب يخلّيها مسترجعة — بعد تذكير، أو من نفسهم.",
        "recovery.cards.captured": "انحفظت",
        "recovery.cards.reminded": "انذكّروا",
        "recovery.cards.recoveredAfterReminder": "رجعوا بعد التذكير",
        "recovery.cards.recoveredOrganic": "رجعوا من نفسهم",
        "recovery.cards.rate": "نسبة الاسترجاع",
        "recovery.cards.value": "قيمة المسترجع",
        "recovery.state.pending": "بالانتظار",
        "recovery.state.reminded": "انذكّر",
        "recovery.state.recovered": "رجع",
        "recovery.loading": "جارِ التحميل…",
        "recovery.empty": "ماكو سلات متروكة بعد.",
        "recovery.items": "{count} قطعة: {names}",
```

- [ ] **Step 6: Show the split.** Replace `apps/platform/app/store/recovery/page.tsx` entirely:

```tsx
"use client";

import { Badge } from "@scheniders/ui";
import { cartItemCount } from "@scheniders/shared";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useAbandonedCarts } from "@/hooks/use-abandoned-carts";
import {
    cartState,
    summarizeRecovery,
    type CartState,
} from "@/lib/recovery-stats";

const STATE_BADGE: Record<CartState, "new" | "contacted" | "confirmed"> = {
    pending: "new",
    reminded: "contacted",
    recovered: "confirmed",
};

const STATE_LABEL_KEY: Record<CartState, string> = {
    pending: "recovery.state.pending",
    reminded: "recovery.state.reminded",
    recovered: "recovery.state.recovered",
};

export default function RecoveryPage() {
    const { t, language } = useLanguage();
    const { data: carts = [], isLoading } = useAbandonedCarts();
    const stats = summarizeRecovery(carts);

    const itemsSummary = (items: { name: string; quantity: number }[]): string => {
        const names = items
            .map((i) => i.name)
            .slice(0, 3)
            .join(t("orders.captures.itemSeparator"));
        const more = items.length > 3 ? ` +${items.length - 3}` : "";
        return names + more;
    };
    const day = new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-GB", {
        timeZone: "Asia/Baghdad",
        dateStyle: "medium",
    });

    const cards = [
        { label: t("recovery.cards.captured"), value: String(stats.total) },
        { label: t("recovery.cards.reminded"), value: String(stats.reminded) },
        {
            label: t("recovery.cards.recoveredAfterReminder"),
            value: String(stats.recoveredAfterReminder),
        },
        { label: t("recovery.cards.recoveredOrganic"), value: String(stats.recoveredOrganic) },
        {
            label: t("recovery.cards.rate"),
            value: `${Math.round(stats.recoveryRate * 100)}%`,
        },
        { label: t("recovery.cards.value"), value: formatIQD(stats.recoveredValue) },
    ];

    return (
        <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">{t("recovery.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("recovery.subtitle")}</p>
            </header>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cards.map((c) => (
                    <div
                        key={c.label}
                        className="rounded-2xl border border-border bg-card p-4"
                    >
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {c.label}
                        </p>
                        <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                            {c.value}
                        </p>
                    </div>
                ))}
            </div>

            {isLoading ? (
                <p className="text-sm text-muted-foreground">{t("recovery.loading")}</p>
            ) : carts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                    {t("recovery.empty")}
                </p>
            ) : (
                <ul className="space-y-3">
                    {carts.map((c) => {
                        const state = cartState(c);
                        return (
                            <li
                                key={c.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium tabular-nums text-foreground" dir="ltr">
                                            {c.phone}
                                        </span>
                                        <Badge variant={STATE_BADGE[state]}>
                                            {t(STATE_LABEL_KEY[state])}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 truncate text-sm text-muted-foreground">
                                        {t("recovery.items", {
                                            count: cartItemCount(c.items),
                                            names: itemsSummary(c.items),
                                        })}
                                    </p>
                                </div>
                                <div className="text-end">
                                    <p className="font-bold tabular-nums text-foreground">
                                        {formatIQD(c.subtotal_iqd)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {day.format(new Date(c.updated_at))}
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
```

Before replacing, re-read the live file: if anything other than the strings, the cards, the grid width and the date/amount formatting differs from this (lines 1-118 on 2026-10-21), carry that difference over rather than dropping it.

- [ ] **Step 7: Run the tests and type-check**

```bash
CI=true pnpm exec vitest run apps/platform/lib/recovery-stats.test.ts apps/platform/lib/i18n-parity.test.ts && pnpm --filter @scheniders/platform type-check
```
Expected: PASS, then exit 0. (The platform vitest config collects no tests under `app/store/`, so the page itself is proven by type-check plus the parity guard.)

- [ ] **Step 8: Commit**

```bash
git add apps/platform/lib/recovery-stats.ts apps/platform/lib/recovery-stats.test.ts apps/platform/hooks/use-abandoned-carts.ts apps/platform/app/store/recovery/page.tsx apps/platform/lib/i18n.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(platform): split recovered carts into after-reminder vs organic" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.9: The reminder stays OFF and can never message a capture without consent

The only change to the sweep is one consent filter. It can only narrow who gets a message, never widen it. The cadence, sender, template, batch and `vercel.json` stay untouched.

**Files:**
- Modify (full rewrite): `apps/platform/app/api/cron/abandoned-cart-recovery/route.test.ts` (lines 1-121)
- Modify: `apps/platform/app/api/cron/abandoned-cart-recovery/route.ts:41-48` (the carts query)

- [ ] **Step 1: Write the failing test.** Replace `apps/platform/app/api/cron/abandoned-cart-recovery/route.test.ts` entirely:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
}));
// The cron guard now fails CLOSED, so these tests present the real calling
// convention — a configured secret plus a matching Bearer header — instead of
// relying on the check disabling itself when no secret was set.
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-cron-secret" } }));
vi.mock("@/lib/abandoned-cart-sender", () => ({
    sendCartRecoveryMessage: vi.fn(),
}));

import { GET } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { sendCartRecoveryMessage } from "@/lib/abandoned-cart-sender";

/** A request carrying the cron secret, as Vercel Cron sends it. */
function authedRequest() {
    return new Request("http://x/api/cron/abandoned-cart-recovery", {
        headers: { authorization: "Bearer test-cron-secret" },
    });
}

type Cart = Record<string, unknown>;

/** The carts query APPLIES its `is` / `not is` filters, so a cart is only
 *  kept out of the sweep if the route actually asked for that. */
function makeClient(carts: Cart[], tenants: unknown[]) {
    const updateEq = vi.fn(() => Promise.resolve({ error: null }));
    const predicates: Array<(r: Cart) => boolean> = [];
    const cartsChain: Record<string, unknown> = {};
    cartsChain.is = (col: string, value: unknown) => {
        predicates.push((r) => (r[col] ?? null) === value);
        return cartsChain;
    };
    cartsChain.not = (col: string, operator: string, value: unknown) => {
        if (operator !== "is") throw new Error(`unsupported not.${operator}`);
        predicates.push((r) => (r[col] ?? null) !== value);
        return cartsChain;
    };
    cartsChain.lte = () => cartsChain;
    cartsChain.order = () => cartsChain;
    cartsChain.limit = () =>
        Promise.resolve({ data: carts.filter((c) => predicates.every((p) => p(c))), error: null });
    const tenantsChain = {
        in: () => Promise.resolve({ data: tenants, error: null }),
    };
    const client = {
        from: (table: string) =>
            table === "tenants"
                ? { select: () => tenantsChain }
                : { select: () => cartsChain, update: () => ({ eq: updateEq }) },
    };
    return { client, updateEq };
}

const OLD = "2020-01-01T00:00:00Z"; // safely past any delay
const CONSENTED = "2020-01-01T00:00:00Z";

function cart(overrides: Cart = {}): Cart {
    return {
        id: "c1",
        tenant_id: "t1",
        phone: "07700000000",
        items: [],
        subtotal_iqd: 1000,
        updated_at: OLD,
        consent_at: CONSENTED,
        ...overrides,
    };
}

const optedIn = {
    id: "t1",
    store_config_v2: { commerce: { cart_recovery: { enabled: true, delay_minutes: 30 } } },
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cron/abandoned-cart-recovery", () => {
    it("nudges + marks reminded for a consented cart of an opted-in tenant past its delay", async () => {
        const { client, updateEq } = makeClient([cart()], [optedIn]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);
        (sendCartRecoveryMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
        });

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(json.sent).toBe(1);
        expect(json.skipped).toBe(0);
        expect(sendCartRecoveryMessage).toHaveBeenCalledTimes(1);
        expect(updateEq).toHaveBeenCalledTimes(1);
    });

    it("never messages a capture without consent, even for an opted-in tenant", async () => {
        const { client, updateEq } = makeClient([cart({ consent_at: null })], [optedIn]);
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(json.sent).toBe(0);
        expect(json.processed).toBe(0);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
        expect(updateEq).not.toHaveBeenCalled();
    });

    it("skips carts of a tenant that hasn't opted in", async () => {
        const { client } = makeClient(
            [cart()],
            [{ id: "t1", store_config_v2: { commerce: { cart_recovery: { enabled: false } } } }],
        );
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(json.sent).toBe(0);
        expect(json.skipped).toBe(1);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });

    it("sends nothing for a store with no cart_recovery key at all (scheniders-iraq today)", async () => {
        const { client } = makeClient(
            [cart()],
            [{ id: "t1", store_config_v2: { commerce: { shipping: {} } } }],
        );
        (createSupabaseServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const res = await GET(authedRequest());
        const json = await res.json();
        expect(json.sent).toBe(0);
        expect(json.skipped).toBe(1);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });

    it("THE RISK: refuses an unauthenticated caller", async () => {
        const res = await GET(new Request("http://x/api/cron/abandoned-cart-recovery"));
        expect(res.status).toBe(401);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });

    it("refuses a caller presenting the wrong secret", async () => {
        const res = await GET(
            new Request("http://x/api/cron/abandoned-cart-recovery", {
                headers: { authorization: "Bearer wrong" },
            }),
        );
        expect(res.status).toBe(401);
        expect(sendCartRecoveryMessage).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
CI=true pnpm exec vitest run apps/platform/app/api/cron/abandoned-cart-recovery/route.test.ts
```
Expected: FAIL in "never messages a capture without consent…": `sent` is 1 and `sendCartRecoveryMessage` was called once.

- [ ] **Step 3: Implement.** In `apps/platform/app/api/cron/abandoned-cart-recovery/route.ts`, replace

```ts
        .is("reminded_at", null)
        .is("recovered_at", null)
        .lte("updated_at", floorCutoff)
```
with
```ts
        .is("reminded_at", null)
        .is("recovered_at", null)
        // Consent: only a shopper who typed their phone with the consent line
        // on screen may get an automatic WhatsApp. A capture without it is a
        // lead for staff to call, never a send.
        .not("consent_at", "is", null)
        .lte("updated_at", floorCutoff)
```

- [ ] **Step 4: Run it until it passes, then type-check**

```bash
CI=true pnpm exec vitest run apps/platform/app/api/cron/abandoned-cart-recovery/route.test.ts && pnpm --filter @scheniders/platform type-check
```
Expected: PASS (6 tests), then exit 0.

- [ ] **Step 5: Prove nothing is switched on live** (read-only `execute_sql`)

```sql
select count(*) filter (where (store_config_v2 -> 'commerce' -> 'cart_recovery' ->> 'enabled') = 'true') as published_on,
       count(*) filter (where (store_config_v2_draft -> 'commerce' -> 'cart_recovery' ->> 'enabled') = 'true') as draft_on
from tenants;
```
Expected: `published_on = 0` and `draft_on = 0`. If either is non-zero, stop and report it. Do not change any tenant config: enabling the reminder is the merchant's decision, made after the wording and the Interakt template are approved.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/app/api/cron/abandoned-cart-recovery/route.ts apps/platform/app/api/cron/abandoned-cart-recovery/route.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "fix(platform): cart recovery sweep never messages a capture without consent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P3.10: Piece 3 verification (no commit unless a step finds and fixes something)

- [ ] **Step 1: Every suite this piece touched**

```bash
CI=true pnpm exec vitest run \
  apps/storefront/lib/store-host.test.ts \
  apps/storefront/lib/proxy-tenant-files.test.ts \
  apps/storefront/app/api/cart/abandoned/route.test.ts \
  apps/storefront/app/actions/ \
  apps/storefront/lib/draft-view-guards.test.tsx \
  packages/sections/src/_pdp-capture-consent.test.tsx \
  packages/sections/src/_customer-memory-forms.test.tsx \
  packages/sections/src/_kurdish-coverage.test.ts \
  packages/sections/src/_pdp-classic-snapshot.test.tsx \
  packages/sections/src/_pdp-express-snapshot.test.tsx \
  packages/sections/src/_pdp-express-form.test.tsx \
  packages/sections/src/_pdp-form.test.tsx \
  apps/platform/hooks/use-open-store-captures.test.tsx \
  apps/platform/components/orders/store-captures-panel.test.tsx \
  apps/platform/lib/recovery-stats.test.ts \
  apps/platform/lib/i18n-parity.test.ts \
  apps/platform/lib/i18n-orders-keys.test.ts \
  apps/platform/app/api/cron/abandoned-cart-recovery/route.test.ts
```
Expected: all PASS.

- [ ] **Step 2: The whole sections package and the storefront app** (catches any other render test pinned to the old beacon body)

```bash
CI=true pnpm exec vitest run packages/sections apps/storefront
```
Expected: all PASS. If a test outside this piece asserts the old beacon body (`tenant_id`, `name` or `price` in `/api/cart/abandoned`), move it to the new contract the way Task P3.5 Step 7 does. Do not restore the old body.

- [ ] **Step 3: The CI gate**

```bash
pnpm type-check && pnpm lint
```
Expected: both exit 0. Platform lint keeps its standing warnings and has 0 errors.

- [ ] **Step 4: Live DB: tenant scoping and RLS unchanged** (read-only `execute_sql`)

```sql
select c.relrowsecurity,
       (select json_agg(polname::text || ':' || polcmd::text || ':' || array_to_string(polroles::regrole[]::text[], ','))
          from pg_policy where polrelid = c.oid) as policies,
       (select count(*) from abandoned_carts) as rows
from pg_class c where c.oid = 'public.abandoned_carts'::regclass;
```
Expected:
- `relrowsecurity = true`
- `policies = ["abandoned_carts_member_select:r:authenticated"]`
- `rows` is unchanged from before the piece (0 on 2026-10-21). This piece writes no live rows: there are no smoke captures against production.

- [ ] **Step 5: Local smoke of the refusal paths only** (writes nothing). Do not POST a valid capture against local dev: the local storefront uses the live database.

In one terminal: `pnpm dev:storefront`. Then:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/cart/abandoned -H 'content-type: application/json' -d '{"tenant_id":"b5c4f2d4-0000-4000-8000-000000000000","phone":"07701234567","items":[{"product_id":"22222222-2222-4222-8222-222222222222","quantity":1}]}'
```
Expected: `400`. The root host with no `Referer` names no store, so the body's `tenant_id` is ignored.
```bash
curl -s -X POST http://localhost:3001/api/cart/abandoned -H 'content-type: application/json' -d '{"phone":"12345","items":[{"product_id":"22222222-2222-4222-8222-222222222222","quantity":1}]}'
```
Expected: `{"success":true,"skipped":"phone"}`.

- [ ] **Step 6: Record what the merchant still has to decide.** Put it in the PR/hand-off notes, not in a repo file:
  - Turn the consent line on for scheniders-iraq: builder → product page → Direct order form → "show_capture_consent". The wording is editable and defaults to «ممكن نراسلك واتساب بخصوص طلبك».
  - The automatic reminder stays OFF. Turning it on needs:
    - (a) approved wording and an approved Interakt `abandoned_cart_recovery` template
    - (b) `commerce.cart_recovery.enabled` set by the merchant
    - (c) the known daily-cadence and oldest-50 starvation issues in the sweep, fixed first. They are out of scope here.
  - A buyer whose phone was already recovered once (they ordered before) is not re-listed when they abandon again. That is the existing one-row-per-(tenant, phone) rule, kept unchanged on purpose.