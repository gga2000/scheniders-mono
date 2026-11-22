import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * How View as merchant finds or makes the staff member's viewer sign-in.
 * Only the Supabase layer is faked: each awaited call answers the next entry
 * of `answers`, in the order the route awaits them.
 */

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const TENANT = "33333333-3333-4333-8333-333333333333";
const VIEWER = "77777777-7777-4777-8777-777777777777";
const EMAIL = `support-viewer-${ADMIN_ID}@usefermi.com`;
const EXPIRES = "2026-11-16T12:00:00+00:00";

type Answer = { data: unknown; error: { code?: string; message: string } | null };
type Call = { method: string; args: unknown[] };

const calls: Call[] = [];
const answers: Answer[] = [];

function fake(): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: Answer) => void) => resolve(answers.shift() ?? { data: null, error: null });
      }
      if (prop === "auth" || prop === "admin") return fake();
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return fake();
      };
    },
  });
}

vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => fake() }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: vi.fn(async () => ({ user: { id: ADMIN_ID, email: "noor@example.com" }, role: "support_staff" })),
}));
vi.mock("@/lib/support-admin-name", () => ({ adminDisplayName: vi.fn(async () => "Noor") }));
vi.mock("@/lib/admin-env", () => ({ env: { PLATFORM_URL: "https://app.test" } }));

const { POST } = await import("./route");

function start(): Promise<Response> {
  return POST(
    new NextRequest("http://admin.test/api/support/view", { method: "POST", body: JSON.stringify({ tenantId: TENANT }) }),
  );
}

const noViewerRow: Answer = { data: null, error: null };
const emailExists: Answer = { data: { user: null }, error: { code: "email_exists", message: "already registered" } };
const session: Answer = { data: { session_id: "s1", expires_at: EXPIRES }, error: null };
const link: Answer = { data: { properties: { hashed_token: "hash-1" }, user: { id: VIEWER } }, error: null };
const ok: Answer = { data: null, error: null };
const called = (method: string) => calls.some((c) => c.method === method);

beforeEach(() => {
  calls.length = 0;
  answers.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/support/view: the viewer sign-in", () => {
  it("finishes a viewer an earlier try made and stopped before its row", async () => {
    answers.push(
      noViewerRow,
      emailExists,
      { data: { user: { id: VIEWER, app_metadata: { provider: "email", support_viewer: true } } }, error: null },
      ok,
      ok,
      link,
      session,
    );
    const res = await start();
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual({ user_id: VIEWER, admin_id: ADMIN_ID });
    expect(called("updateUserById")).toBe(false);
  });

  it("never takes over an account at the viewer address that the console did not make, and makes the viewer at a second address", async () => {
    answers.push(
      noViewerRow,
      emailExists,
      { data: { user: { id: "someone-else", app_metadata: { provider: "email" } } }, error: null },
      { data: { user: { id: VIEWER } }, error: null },
      ok,
      ok,
      link,
      session,
    );
    const res = await start();
    // Audit R4-N1: an account signed up with a staff id switched View as merchant off for them (409).
    expect(res.status).toBe(200);
    for (const method of ["updateUserById", "deleteUser"]) expect(called(method)).toBe(false);
    const made = calls.filter((c) => c.method === "createUser").map((c) => (c.args[0] as { email: string }).email);
    expect(made[0]).toBe(EMAIL);
    expect(made[1]).toMatch(new RegExp(`^support-viewer-${ADMIN_ID}-[0-9a-f-]{36}@usefermi\\.com$`));
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual({ user_id: VIEWER, admin_id: ADMIN_ID });
    expect(calls.filter((c) => c.method === "generateLink").map((c) => c.args[0])).toEqual([
      { type: "magiclink", email: EMAIL },
      { type: "magiclink", email: made[1] },
    ]);
  });

  it("treats a flag that is only truthy as not ours", async () => {
    answers.push(
      noViewerRow,
      emailExists,
      { data: { user: { id: "someone-else", app_metadata: { support_viewer: "true" } } }, error: null },
      { data: { user: { id: VIEWER } }, error: null },
      ok,
      ok,
      link,
      session,
    );
    expect((await start()).status).toBe(200);
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual({ user_id: VIEWER, admin_id: ADMIN_ID });
  });

  it("makes the sign-in link for the address the viewer was made at", async () => {
    const second = `support-viewer-${ADMIN_ID}-0b7c6a4e-1f2d-4c3b-9a8e-7d6c5b4a3f21@usefermi.com`;
    answers.push({ data: { user_id: VIEWER }, error: null }, { data: { user: { id: VIEWER, email: second } }, error: null }, link, session);
    expect((await start()).status).toBe(200);
    expect(calls.filter((c) => c.method === "generateLink").map((c) => c.args[0])).toEqual([{ type: "magiclink", email: second }]);
    expect(called("createUser")).toBe(false);
  });

  it("answers 500, and starts no look, when the viewer's address cannot be read", async () => {
    answers.push({ data: { user_id: VIEWER }, error: null }, { data: { user: null }, error: { message: "down" } });
    expect((await start()).status).toBe(500);
    expect(called("generateLink")).toBe(false);
    expect(called("rpc")).toBe(false);
  });

  it("answers 500 when the second address is taken too", async () => {
    answers.push(
      noViewerRow,
      emailExists,
      { data: { user: { id: "someone-else", app_metadata: {} } }, error: null },
      emailExists,
    );
    expect((await start()).status).toBe(500);
    expect(called("insert")).toBe(false);
  });

  it("answers 500 when the account cannot be looked up", async () => {
    answers.push(noViewerRow, emailExists, { data: { user: null }, error: { message: "down" } });
    expect((await start()).status).toBe(500);
    expect(called("insert")).toBe(false);
  });
});
