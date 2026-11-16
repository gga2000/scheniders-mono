import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Adding a person who already has a login, with a new password. The reset's
 * answer was ignored: a refused password still granted access, the screen
 * said it worked, and the staff log recorded "password_reset: true".
 */

const logged: Array<{ action: string; details: unknown }> = [];
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async () => ({ user: { id: "me", email: "me@b.co" }, role: "super_admin" }),
  requireAdminFromRequest: async () => ({ user: { id: "me", email: "me@b.co" }, role: "super_admin" }),
}));
vi.mock("@/lib/activity-logger", () => ({
  logAdminAction: async (_admin: unknown, action: string, opts: { details: unknown }) => {
    logged.push({ action, details: opts.details });
  },
}));

let resetError: { message: string; status?: number } | null;
let upserts: string[];

function from(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () =>
      table === "user_profiles"
        ? { data: { id: "u1", display_name: "Noor" }, error: null }
        : { data: { user_id: "u1" }, error: null },
    upsert: async () => {
      upserts.push(table);
      return { error: null };
    },
    then: (resolve: (answer: { count: number; error: null }) => void) => resolve({ count: 0, error: null }),
  };
  return builder;
}

const client = {
  from,
  auth: { admin: { updateUserById: async () => ({ data: null, error: resetError }) } },
};
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => client }));

const { POST } = await import("./route");
const add = () =>
  POST(
    new NextRequest("http://admin.test/api/admin-users", {
      method: "POST",
      body: JSON.stringify({ email: "noor@b.co", adminRole: "support_staff", password: "new-password-1" }),
    }),
  );

beforeEach(() => {
  resetError = null;
  upserts = [];
  logged.length = 0;
});

describe("POST /api/admin-users with a new password for an existing login", () => {
  it("stops when the password is refused: no access, no log", async () => {
    resetError = { message: "Password is known to be weak", status: 422 };

    const res = await add();

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Could not set the new password: Password is known to be weak");
    expect(upserts).toEqual([]);
    expect(logged).toEqual([]);
  });

  it("grants access and logs the reset when it worked", async () => {
    const res = await add();

    expect(res.status).toBe(200);
    expect(upserts).toEqual(["admin_users"]);
    expect(logged[0]).toMatchObject({ action: "grant_admin_access", details: { password_reset: true } });
  });
});
