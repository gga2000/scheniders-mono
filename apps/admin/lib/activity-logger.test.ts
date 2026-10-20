import { describe, it, expect, vi, beforeEach } from "vitest";

// Captures what the logger hands to PostgREST so the assertions below are about
// the actual column names, not about the helper's own types.
const inserted: unknown[] = [];
const insert = vi.fn((rows: unknown) => {
  inserted.push(rows);
  return Promise.resolve({ error: null });
});
const from = vi.fn(() => ({ insert }));

vi.mock("./admin-supabase", () => ({
  createAdminClient: () => ({ from }),
}));

const { logAdminActivity, logAdminActivityBatch } = await import("./activity-logger");

const UUID = "11111111-2222-3333-4444-555555555555";

/** The live `admin_activity_logs` columns. An insert naming anything else is
 *  rejected by PostgREST, which is how admin logging silently recorded nothing
 *  for ~178 days: three call sites wrote `admin_id`, which does not exist. */
const COLUMNS = [
  "admin_user_id",
  "admin_label",
  "actor_email",
  "tenant_id",
  "action",
  "details",
  "ip_address",
  "user_agent",
];

beforeEach(() => {
  inserted.length = 0;
  insert.mockClear();
  from.mockClear();
});

describe("logAdminActivity", () => {
  it("writes to admin_activity_logs", async () => {
    await logAdminActivity({ adminUserId: UUID, action: "impersonate" });
    expect(from).toHaveBeenCalledWith("admin_activity_logs");
  });

  it("emits only real columns — never admin_id", async () => {
    await logAdminActivity({ adminUserId: UUID, action: "impersonate" });
    const row = inserted[0] as Record<string, unknown>;

    expect(Object.keys(row).sort()).toEqual([...COLUMNS].sort());
    expect(row).not.toHaveProperty("admin_id");
  });

  it("puts a uuid actor in admin_user_id", async () => {
    await logAdminActivity({
      adminUserId: UUID,
      actorEmail: "admin@example.com",
      tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      action: "impersonate",
    });
    const row = inserted[0] as Record<string, unknown>;

    expect(row.admin_user_id).toBe(UUID);
    expect(row.actor_email).toBe("admin@example.com");
    expect(row.tenant_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(row.action).toBe("impersonate");
  });

  it("routes a non-uuid actor to admin_label, leaving admin_user_id null", async () => {
    // `admin_user_id` is a uuid column; "system" would abort the insert.
    await logAdminActivity({ adminUserId: "system", action: "bulk_suspend" });
    const row = inserted[0] as Record<string, unknown>;

    expect(row.admin_user_id).toBeNull();
    expect(row.admin_label).toBe("system");
  });

  it("does not label a real admin actor as 'system'", async () => {
    // The Activity page shows admin_label before actor_email, so a "system"
    // fallback here would hide the admin who paused/unpaused/impersonated.
    await logAdminActivity({
      adminUserId: UUID,
      actorEmail: "admin@example.com",
      action: "pause_tenant",
    });
    const row = inserted[0] as Record<string, unknown>;

    expect(row.admin_label).toBeNull();
    expect(row.actor_email).toBe("admin@example.com");
  });

  it("keeps an explicit adminLabel", async () => {
    await logAdminActivity({ adminUserId: UUID, adminLabel: "Ali", action: "pause_tenant" });
    expect((inserted[0] as Record<string, unknown>).admin_label).toBe("Ali");
  });

  it("defaults details to an object and the nullable columns to null", async () => {
    await logAdminActivity({ adminUserId: null, action: "noop" });
    const row = inserted[0] as Record<string, unknown>;

    expect(row.details).toEqual({});
    expect(row.tenant_id).toBeNull();
    expect(row.ip_address).toBeNull();
    expect(row.user_agent).toBeNull();
    expect(row.admin_label).toBe("system");
  });
});

describe("logAdminActivityBatch", () => {
  it("writes one row per tenant in a single insert, sharing the envelope", async () => {
    await logAdminActivityBatch({
      adminUserId: UUID,
      actorEmail: "admin@example.com",
      tenantIds: ["t-1", "t-2", "t-3"],
      action: "bulk_suspend",
      details: { reason: "nonpayment" },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const rows = inserted[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.tenant_id)).toEqual(["t-1", "t-2", "t-3"]);

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([...COLUMNS].sort());
      expect(row).not.toHaveProperty("admin_id");
      expect(row.admin_user_id).toBe(UUID);
      expect(row.action).toBe("bulk_suspend");
      expect(row.details).toEqual({ reason: "nonpayment" });
    }
  });

  it("does not touch the database for an empty tenant list", async () => {
    await logAdminActivityBatch({ adminUserId: UUID, tenantIds: [], action: "bulk_suspend" });
    expect(from).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
