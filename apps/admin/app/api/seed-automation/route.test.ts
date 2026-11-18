import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Seed Automation. A status read that failed answered 200 with "off", so the
 * Home switch showed off for a state nobody knew. With no seed job at all
 * (as live on 17 Nov), switching "on" changed nothing yet answered success,
 * so the switch turned green and logged a change. Both now say so.
 */

const rpc = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: vi.fn(async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" })),
  requireAdminPermission: vi.fn(async () => ({ user: { id: "a1", email: "a@b.co" }, role: "super_admin" })),
}));
const logAdminAction = vi.fn();
vi.mock("@/lib/activity-logger", () => ({ logAdminAction }));

const { GET, POST } = await import("./route");

const read = () => GET(new NextRequest("http://admin.test/api/seed-automation"));
const flip = (body: unknown) =>
  POST(new NextRequest("http://admin.test/api/seed-automation", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  rpc.mockReset();
  logAdminAction.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/seed-automation", () => {
  it("answers the jobs' state", async () => {
    rpc.mockResolvedValue({ data: { active: true, jobs: [{ jobname: "seed_orders", schedule: "*/5 * * * *", active: true }] }, error: null });

    const res = await read();

    expect(res.status).toBe(200);
    expect((await res.json()).active).toBe(true);
  });

  it("answers 500 when the state could not be read, never 'off'", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied for schema cron" } });

    const res = await read();

    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("active");
  });
});

describe("POST /api/seed-automation", () => {
  it("switches the jobs and logs it", async () => {
    rpc.mockResolvedValue({ data: { active: true, jobs_updated: 2 }, error: null });

    const res = await flip({ active: true });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("toggle_seed_automation", { _active: true });
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), "update_settings", {
      details: { setting: "seed_automation", active: true, jobs: 2 },
    });
  });

  it("says nothing changed, and logs nothing, when there is no seed job to switch", async () => {
    rpc.mockResolvedValue({ data: { active: true, jobs_updated: 0 }, error: null });

    const res = await flip({ active: true });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("There is no seed job to switch, so nothing changed.");
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a body that does not say on or off, before any call", async () => {
    const res = await flip({ active: "yes" });

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
