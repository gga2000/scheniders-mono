import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LEAD_IMPORT_MAX_ROWS, leadImportResultSchema } from "@/lib/lead-import";

/*
 * The import answered with fields the dialog did not read, so 300 rows with
 * 120 left out still showed "300 imported". The answer now counts saved,
 * skipped and failed rows and names each failed row.
 */

const ADMIN_ID = "aaaaaaaa-1111-4222-8333-444444444444";

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: ADMIN_ID, email: "a@b.co" }, role: "super_admin" }),
}));

const inserted: Record<string, unknown>[] = [];
/** Merchant names the database refuses, with the message it gives. */
const refused = new Map<string, string>();

// The per-staff limit has its own test (lib/staff-rate-limit.test.ts).
vi.mock("@/lib/staff-rate-limit", () => ({ staffRateLimit: async () => null }));
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table !== "leads") throw new Error(`unexpected table ${table}`);
        const message = refused.get(String(row.merchant_name));
        if (message) return { error: { message } };
        inserted.push(row);
        return { error: null };
      },
    }),
  }),
}));

const logAdminAction = vi.fn(async () => undefined);
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

const { POST } = await import("./route");

const call = (body: unknown) =>
  POST(
    new NextRequest("http://admin.test/api/leads/import", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  inserted.length = 0;
  refused.clear();
  logAdminAction.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/leads/import", () => {
  it("counts saved, skipped and failed rows and names each failed row", async () => {
    refused.set("Twice", 'duplicate key value violates unique constraint "leads_handle_key"');
    const response = await call({
      leads: [
        { merchant_name: "Noor Fashion", platform: "Instagram", follower_count: "12.5K" },
        { merchant_name: "", platform: "instagram" },
        { merchant_name: "Old Shop", platform: "Telegram" },
        { merchant_name: "Twice", platform: "tiktok" },
      ],
    });

    expect(response.status).toBe(201);
    const body = leadImportResultSchema.parse(await response.json());
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.failed).toBe(2);
    expect(body.failures).toEqual([
      { row: 3, name: "Old Shop", reason: expect.stringMatching(/^Platform "Telegram" is not known/) },
      { row: 4, name: "Twice", reason: 'duplicate key value violates unique constraint "leads_handle_key"' },
    ]);
    expect(body.created + body.skipped + body.failed).toBe(4);
    // One row in the staff log for the whole file.
    expect(logAdminAction.mock.calls.map((call) => call.slice(1))).toEqual([
      ["import_leads", { details: { rows: 4, created: 1, skipped: 1, failed: 2 } }],
    ]);
  });

  it("saves the row under the admin who ran the import, whatever the file says", async () => {
    await call({ leads: [{ merchant_name: "Noor", platform: "instagram", created_by: "someone-else", status: "converted" }] });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].created_by).toBe(ADMIN_ID);
    expect(inserted[0]).not.toHaveProperty("status");
    expect(inserted[0].follower_count).toBe(0);
  });

  it("answers 200, not 201, when no row was saved", async () => {
    const response = await call({ leads: [{ merchant_name: "" }, { merchant_name: "A", priority: "soon" }] });
    expect(response.status).toBe(200);
    const body = leadImportResultSchema.parse(await response.json());
    expect(body).toMatchObject({ created: 0, skipped: 1, failed: 1 });
    expect(inserted).toHaveLength(0);
  });

  it("refuses a body with no list of rows", async () => {
    for (const body of [{}, { leads: "x" }, { leads: [1, 2] }, "not json"]) {
      const response = await call(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "leads array required" });
    }
    expect(inserted).toHaveLength(0);
  });

  it("refuses more rows than one import may carry, and saves none of them", async () => {
    const leads = Array.from({ length: LEAD_IMPORT_MAX_ROWS + 1 }, (_, i) => ({ merchant_name: `Shop ${i}` }));
    const response = await call({ leads });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This file has 501 rows. One import takes up to 500: split the file and import each part.",
    });
    expect(inserted).toHaveLength(0);
  });
});
