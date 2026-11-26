import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** Newest refused-for-balance send and newest good send, in that order. */
let refusedAt: string | null;
let sentAt: string | null;
/** Shops paused to protect the shared number. */
let pausedCount: number;
/** Paid custom messages waiting for us to submit them. */
let customCount: number;
const customFilters: Array<[string, unknown]> = [];
const pausedFilters: Array<[string, unknown]> = [];

function query(statusFilter: { value: string | null }) {
  const q = {
    select: () => q,
    eq: (col: string, val: string) => {
      if (col === "status") statusFilter.value = val;
      return q;
    },
    gte: () => q,
    ilike: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: () => {
      const at = statusFilter.value === "failed" ? refusedAt : sentAt;
      return Promise.resolve({ data: at ? { created_at: at } : null, error: null });
    },
  };
  return q;
}

function pausedQuery() {
  const q = {
    select: () => q,
    is: (col: string, val: unknown) => {
      pausedFilters.push([col, val]);
      return Promise.resolve({ count: pausedCount, error: null });
    },
  };
  return q;
}

function customQuery() {
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      customFilters.push([col, val]);
      return Promise.resolve({ count: customCount, error: null });
    },
  };
  return q;
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === "whatsapp_sender_pauses"
        ? pausedQuery()
        : table === "whatsapp_custom_templates"
          ? customQuery()
          : query({ value: null }),
  }),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: vi.fn(async () => ({ user: { id: "a" }, role: "super_admin" })),
}));

const { GET } = await import("./route");

async function health() {
  return (await GET(new NextRequest("http://localhost/api/whatsapp-health"))).json();
}

beforeEach(() => {
  refusedAt = null;
  sentAt = null;
  pausedCount = 0;
  pausedFilters.length = 0;
  customCount = 0;
  customFilters.length = 0;
});

describe("GET /api/whatsapp-health", () => {
  it("empty when Interakt refused for balance after the last good send", async () => {
    sentAt = "2026-11-10T00:00:00.000Z";
    refusedAt = "2026-11-10T01:00:00.000Z";
    expect(await health()).toEqual({ interaktEmpty: true, since: refusedAt, pausedShops: 0, customToSubmit: 0 });
  });

  it("fine again once a message goes out after the refusal", async () => {
    refusedAt = "2026-11-10T01:00:00.000Z";
    sentAt = "2026-11-10T02:00:00.000Z";
    expect(await health()).toEqual({ interaktEmpty: false, since: null, pausedShops: 0, customToSubmit: 0 });
  });

  it("fine when nothing was refused", async () => {
    sentAt = "2026-11-10T02:00:00.000Z";
    expect(await health()).toEqual({ interaktEmpty: false, since: null, pausedShops: 0, customToSubmit: 0 });
  });

  it("counts the shops paused now, not the ones staff resumed", async () => {
    pausedCount = 2;
    expect(await health()).toMatchObject({ pausedShops: 2 });
    expect(pausedFilters).toEqual([["resumed_at", null]]);
  });

  it("counts the paid custom messages waiting for us to submit, not those at Meta", async () => {
    customCount = 3;
    expect(await health()).toMatchObject({ customToSubmit: 3 });
    expect(customFilters).toEqual([["status", "review"]]);
  });
});
