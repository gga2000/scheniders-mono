import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/*
 * The export asked for every row in one request. The API answers with at most
 * 1,000 rows and says nothing, and the ledger export also asked for only the
 * newest 1,000, so a file could be short with no sign of it. Shop names typed
 * by merchants went into the sheet as they were, so a name starting with "="
 * ran as a formula, and Arabic names opened as broken letters in Excel.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

type Row = Record<string, unknown>;
const SERVER_MAX_ROWS = 1000;
let tables: Record<string, Row[]>;
let failAt: number | null;
let ranges: Array<[number, number]>;
let limits: number[];
let orders: string[];

/** A stand-in for the query builder: filters by eq, answers a range, never more than the server cap. */
function query(table: string) {
  let rows = tables[table] ?? [];
  let window: [number, number] = [0, SERVER_MAX_ROWS - 1];
  const builder = {
    select: () => builder,
    order: (column: string) => {
      orders.push(`${table}.${column}`);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    limit: (count: number) => {
      limits.push(count);
      window = [0, count - 1];
      return builder;
    },
    range: (from: number, to: number) => {
      ranges.push([from, to]);
      window = [from, to];
      return builder;
    },
    then: (resolve: (answer: { data: Row[] | null; error: { message: string } | null }) => void) => {
      if (failAt !== null && window[0] >= failAt) return resolve({ data: null, error: { message: "connection lost" } });
      const to = Math.min(window[1], window[0] + SERVER_MAX_ROWS - 1);
      return resolve({ data: rows.slice(window[0], to + 1), error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ from: query }) }));

const { GET } = await import("./route");
const call = (params: string) => GET(new NextRequest(`http://admin.test/api/export?${params}`));

const shop = (n: number, extra: Row = {}): Row => ({
  id: `shop-${n}`,
  business_name: `Shop ${n}`,
  slug: `shop-${n}`,
  plan: "starter",
  status: "active",
  city: "Baghdad",
  contact_email: `owner${n}@shop.test`,
  contact_phone: "+9647701234567",
  created_at: "2026-10-01T09:00:00Z",
  trial_ends_at: null,
  wallet: { balance_iqd: 1200, total_charged_iqd: 9055, total_topped_up_iqd: 10255 },
  ...extra,
});

const ledgerLine = (n: number): Row => ({
  id: `tx-${n}`,
  tenant_id: "shop-1",
  type: "order_fee",
  amount_iqd: -55,
  balance_after_iqd: 1000,
  description: "Delivered order",
  created_at: "2026-11-01T09:00:00Z",
  tenants: { business_name: "Shop 1" },
});

const linesOf = (csv: string) => csv.replace(/^﻿/, "").split("\n");

beforeEach(() => {
  tables = { tenants: [shop(1)], wallet_transactions: [ledgerLine(1)] };
  failAt = null;
  ranges = [];
  limits = [];
  orders = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/export", () => {
  it("exports every ledger line, not the newest 1,000", async () => {
    tables.wallet_transactions = Array.from({ length: 2300 }, (_, n) => ledgerLine(n));

    const lines = linesOf(await (await call("type=transactions")).text());

    expect(lines).toHaveLength(2301);
    expect(lines.at(-1)).toContain("tx-2299");
    expect(limits).toEqual([]);
    expect(ranges.map(([from]) => from)).toEqual([0, 1000, 2000, 2300]);
  });

  it("exports every shop when there are more than one page of them", async () => {
    tables.tenants = Array.from({ length: 1200 }, (_, n) => shop(n));

    const rows = await (await call("type=merchants&format=json")).json();

    expect(rows).toHaveLength(1200);
    expect(rows.at(-1).id).toBe("shop-1199");
  });

  it("reads pages in a fixed order, so no row is skipped or repeated between pages", async () => {
    await call("type=merchants");
    await call("type=transactions");

    // Every page of a list repeats the same two sort keys; the id breaks ties between rows made in the same instant.
    expect([...new Set(orders)]).toEqual([
      "tenants.created_at",
      "tenants.id",
      "wallet_transactions.created_at",
      "wallet_transactions.id",
    ]);
  });

  it("sends no file when a page fails, instead of a short one", async () => {
    tables.wallet_transactions = Array.from({ length: 2300 }, (_, n) => ledgerLine(n));
    failAt = 1000;

    const response = await call("type=transactions");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to export data" });
  });

  it("keeps a shop name from running as a spreadsheet formula", async () => {
    tables.tenants = [shop(1, { business_name: '=HYPERLINK("http://bad.test","Open")', city: "@SUM(A1)" })];

    const [, row] = linesOf(await (await call("type=merchants")).text());

    expect(row).toContain(`"'=HYPERLINK(""http://bad.test"",""Open"")"`);
    expect(row).toContain("'@SUM(A1)");
  });

  it("leaves phone numbers and negative amounts as they are", async () => {
    const [, shopRow] = linesOf(await (await call("type=merchants")).text());
    const [, ledgerRow] = linesOf(await (await call("type=transactions")).text());

    expect(shopRow).toContain(",+9647701234567,");
    expect(ledgerRow).toContain(",-55,");
  });

  it("marks the sheet as UTF-8, so Arabic shop names open correctly in Excel", async () => {
    tables.tenants = [shop(1, { business_name: "عطور الرافدين" })];

    const response = await call("type=merchants");
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(new TextDecoder().decode(bytes)).toContain("عطور الرافدين");
  });

  it("dates the file by the Baghdad day", async () => {
    // 22:30 UTC on the 15th is 01:30 on the 16th in Baghdad.
    vi.useFakeTimers({ now: new Date("2026-11-15T22:30:00Z"), toFake: ["Date"] });

    const response = await call("type=merchants");

    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="merchants_export_2026-11-16.csv"');
  });

  it("lists only shops on trial, with whole days left, and a blank when no end date is set", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-16T09:00:00Z"), toFake: ["Date"] });
    tables.tenants = [
      shop(1, { status: "trial", trial_ends_at: "2026-11-18T09:00:00Z" }),
      shop(2, { status: "trial", trial_ends_at: null }),
      shop(3, { status: "active" }),
    ];

    const rows = await (await call("type=trials&format=json")).json();

    expect(rows.map((row: Row) => [row.id, row.days_remaining])).toEqual([
      ["shop-1", 2],
      ["shop-2", null],
    ]);
  });

  it("refuses a type it does not know", async () => {
    expect((await call("type=orders")).status).toBe(400);
  });
});
