import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { rowPassesOr } from "@/lib/supabase-stub.test-data";

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
let ins: number[];

/** A stand-in for the query builder: filters by eq, or and match, answers a range, never more than the server cap. */
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
    or: (filter: string) => {
      rows = rows.filter((row) => rowPassesOr(row, filter));
      return builder;
    },
    // "tenants.is_demo" is a column of the embedded shop, as an inner join reads it.
    match: (query: Row) => {
      const field = (row: Row, column: string): unknown =>
        column.split(".").reduce<unknown>((at, key) => (at as Row | undefined)?.[key], row);
      rows = rows.filter((row) => Object.entries(query).every(([column, value]) => field(row, column) === value));
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      ins.push(values.length);
      rows = rows.filter((row) => values.includes(row[column]));
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

// The per-staff limit has its own test (lib/staff-rate-limit.test.ts).
vi.mock("@/lib/staff-rate-limit", () => ({ staffRateLimit: async () => null }));
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ from: query }) }));

const logAdminAction = vi.fn(async () => undefined);
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

const { GET, POST } = await import("./route");
// window.open from a console page: the browser says the request came from the same site.
const call = (params: string, site: string | null = "same-origin") =>
  GET(new NextRequest(`http://admin.test/api/export?${params}`, { headers: site ? { "sec-fetch-site": site } : {} }));

const shop = (n: number, extra: Row = {}): Row => ({
  id: `shop-${n}`,
  is_demo: false, is_prospect: false,
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
  tenants: { business_name: "Shop 1", is_demo: false, is_prospect: false },
});

const linesOf = (csv: string) => csv.replace(/^﻿/, "").split("\n");

beforeEach(() => {
  tables = { tenants: [shop(1)], wallet_transactions: [ledgerLine(1)] };
  failAt = null;
  ranges = [];
  limits = [];
  orders = [];
  ins = [];
  logAdminAction.mockClear();
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

  it("writes who took which file, and how many rows, to the staff log", async () => {
    tables.tenants = Array.from({ length: 1200 }, (_, n) => shop(n));
    await call("type=merchants");

    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "a" }) }),
      "export_data",
      { details: { type: "merchants", format: "csv", rows: 1200 } },
    );
  });

  it("logs no export when no file was sent", async () => {
    failAt = 0;
    expect((await call("type=merchants")).status).toBe(500);
    expect((await call("type=nothing")).status).toBe(400);
    expect(logAdminAction).not.toHaveBeenCalled();
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

  it("lists a paused trial too, as Trials does, and no other paused shop", async () => {
    tables.tenants = [
      shop(1, { status: "trial", trial_ends_at: "2026-11-18T09:00:00Z" }),
      shop(2, { status: "limited", restrictions: { status_before: "trial" }, trial_ends_at: "2026-11-18T09:00:00Z" }),
      shop(3, { status: "limited", restrictions: { status_before: "active" }, trial_ends_at: "2026-11-01T09:00:00Z" }),
    ];
    const rows = await (await call("type=trials&format=json")).json();
    expect(rows.map((row: Row) => row.id)).toEqual(["shop-1", "shop-2"]);
  });

  it("lists no prospect store or demo store among the trials", async () => {
    tables.tenants = [
      shop(1, { status: "trial", trial_ends_at: "2026-11-18T09:00:00Z" }),
      shop(2, { status: "trial", trial_ends_at: "2026-11-18T09:00:00Z", is_prospect: true }),
      shop(3, { status: "trial", trial_ends_at: "2026-11-18T09:00:00Z", is_demo: true }),
    ];
    const rows = await (await call("type=trials&format=json")).json();
    expect(rows.map((row: Row) => row.id)).toEqual(["shop-1"]);
  });

  it("puts no demo store or prospect store money in the transactions file", async () => {
    tables.wallet_transactions = [
      ledgerLine(1),
      { ...ledgerLine(2), tenant_id: "demo", tenants: { business_name: "Demo", is_demo: true, is_prospect: false } },
      { ...ledgerLine(3), tenant_id: "prospect", tenants: { business_name: "Lead", is_demo: false, is_prospect: true } },
    ];
    const rows = await (await call("type=transactions&format=json")).json();
    expect(rows.map((row: Row) => row.id)).toEqual(["tx-1"]);
  });

  it("starts no file and logs nothing when the request came from another site", async () => {
    tables.tenants = [shop(1)];
    for (const site of ["cross-site", "same-site", "none", null]) {
      const res = await call("type=merchants&format=csv", site);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "This download did not start from the staff console, so it was refused." });
    }
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a type it does not know", async () => {
    expect((await call("type=orders")).status).toBe(400);
  });
});

describe("POST /api/export: the ticked shops", () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const post = (body: unknown) =>
    POST(new NextRequest("http://admin.test/api/export", { method: "POST", body: JSON.stringify(body) }));

  beforeEach(() => {
    tables.tenants = Array.from({ length: 5 }, (_, n) =>
      shop(n, { id: uuid(n), created_at: `2026-10-0${n + 1}T09:00:00Z` }),
    );
  });

  it("exports only the shops that were ticked, oldest first", async () => {
    const rows = await (await post({ type: "merchants", format: "json", ids: [uuid(3), uuid(1)] })).json();

    expect(rows.map((row: Row) => row.id)).toEqual([uuid(1), uuid(3)]);
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), "export_data", {
      details: { type: "merchants", format: "json", rows: 2, selected: 2 },
    });
  });

  it("reads many ticked shops a few hundred at a time, so the request stays short", async () => {
    tables.tenants = Array.from({ length: 450 }, (_, n) => shop(n, { id: uuid(n) }));

    const rows = await (await post({ type: "merchants", format: "json", ids: tables.tenants.map((row) => row.id) })).json();

    expect(rows).toHaveLength(450);
    expect(new Set(rows.map((row: Row) => row.id)).size).toBe(450);
    expect(Math.max(...ins)).toBe(200);
  });

  it("never puts the demo store in the file, even when it is ticked", async () => {
    tables.tenants[0] = { ...tables.tenants[0], is_demo: true, is_prospect: false };

    const rows = await (await post({ type: "merchants", format: "json", ids: [uuid(0), uuid(1)] })).json();

    expect(rows.map((row: Row) => row.id)).toEqual([uuid(1)]);
  });

  it.each([
    ["no shops", { type: "merchants", ids: [] }],
    ["an id that is not a shop id", { type: "merchants", ids: ["1 or 1=1"] }],
    ["another list", { type: "transactions", ids: [uuid(1)] }],
    ["no body", undefined],
  ])("refuses %s", async (_name, body) => {
    expect((await post(body)).status).toBe(400);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("answers a CSV file the page can save under its name", async () => {
    const response = await post({ type: "merchants", ids: [uuid(2)] });

    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="merchants_export_\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(linesOf(await response.text())).toHaveLength(2);
  });
});
