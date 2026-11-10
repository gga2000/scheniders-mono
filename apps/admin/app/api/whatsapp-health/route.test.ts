import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** Newest refused-for-balance send and newest good send, in that order. */
let refusedAt: string | null;
let sentAt: string | null;

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

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({ from: () => query({ value: null }) }),
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
});

describe("GET /api/whatsapp-health", () => {
  it("empty when Interakt refused for balance after the last good send", async () => {
    sentAt = "2026-11-10T00:00:00.000Z";
    refusedAt = "2026-11-10T01:00:00.000Z";
    expect(await health()).toEqual({ interaktEmpty: true, since: refusedAt });
  });

  it("fine again once a message goes out after the refusal", async () => {
    refusedAt = "2026-11-10T01:00:00.000Z";
    sentAt = "2026-11-10T02:00:00.000Z";
    expect(await health()).toEqual({ interaktEmpty: false, since: null });
  });

  it("fine when nothing was refused", async () => {
    sentAt = "2026-11-10T02:00:00.000Z";
    expect(await health()).toEqual({ interaktEmpty: false, since: null });
  });
});
