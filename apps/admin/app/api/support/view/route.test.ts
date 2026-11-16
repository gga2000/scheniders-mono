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
vi.mock("@/lib/activity-logger", () => ({ logAdminActivity: vi.fn(async () => undefined) }));
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
      session,
      link,
    );
    const res = await start();
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.method === "insert")?.args[0]).toEqual({ user_id: VIEWER, admin_id: ADMIN_ID });
    expect(called("updateUserById")).toBe(false);
  });

  it("never takes over an account at the viewer address that the console did not make", async () => {
    answers.push(
      noViewerRow,
      emailExists,
      { data: { user: { id: "someone-else", app_metadata: { provider: "email" } } }, error: null },
    );
    const res = await start();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/already in use/);
    for (const method of ["updateUserById", "upsert", "insert", "rpc"]) expect(called(method)).toBe(false);
    expect(calls.filter((c) => c.method === "generateLink")).toEqual([
      { method: "generateLink", args: [{ type: "magiclink", email: EMAIL }] },
    ]);
  });

  it("treats a flag that is only truthy as not ours", async () => {
    answers.push(
      noViewerRow,
      emailExists,
      { data: { user: { id: "someone-else", app_metadata: { support_viewer: "true" } } }, error: null },
    );
    expect((await start()).status).toBe(409);
    expect(called("insert")).toBe(false);
  });

  it("answers 500 when the account cannot be looked up", async () => {
    answers.push(noViewerRow, emailExists, { data: { user: null }, error: { message: "down" } });
    expect((await start()).status).toBe(500);
    expect(called("insert")).toBe(false);
  });
});
