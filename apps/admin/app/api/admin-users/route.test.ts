import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Adding a person who already has a login, with a new password. The reset's
 * answer was ignored: a refused password still granted access, the screen
 * said it worked, and the staff log recorded "password_reset: true".
 *
 * Round 5: a login that was not staff yet got console access with its old
 * password, so whoever had set that password (a store, say) could sign in.
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
let resets: string[];
/** The login's admin_users row: present for staff, null for a login that is not staff yet. */
let staffRow: { user_id: string } | null;

function from(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () =>
      table === "user_profiles"
        ? { data: { id: "u1", display_name: "Noor" }, error: null }
        : { data: staffRow, error: null },
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
  auth: {
    admin: {
      updateUserById: async (id: string) => {
        resets.push(id);
        return { data: null, error: resetError };
      },
    },
  },
};
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => client }));

const { POST } = await import("./route");
const add = (password: string | null = "new-password-1") =>
  POST(
    new NextRequest("http://admin.test/api/admin-users", {
      method: "POST",
      body: JSON.stringify({ email: "noor@b.co", adminRole: "support_staff", password }),
    }),
  );

beforeEach(() => {
  resetError = null;
  upserts = [];
  resets = [];
  staffRow = { user_id: "u1" };
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

describe("POST /api/admin-users for a login that is not staff yet", () => {
  beforeEach(() => {
    staffRow = null;
  });

  it("refuses without a new password: nothing proves who knows the old one", async () => {
    const res = await add(null);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "This email already has a login. Set a new password for it: the old one stops working and every sign-in on it ends.",
    );
    expect(resets).toEqual([]);
    expect(upserts).toEqual([]);
    expect(logged).toEqual([]);
  });

  it("sets the new password first, which ends every sign-in, then grants access", async () => {
    const res = await add();

    expect(res.status).toBe(200);
    expect(resets).toEqual(["u1"]);
    expect(upserts).toEqual(["admin_users"]);
    expect(logged[0]).toMatchObject({ action: "grant_admin_access", details: { password_reset: true, created_account: false } });
  });

  it("grants nothing when the new password is refused", async () => {
    resetError = { message: "Password is known to be weak", status: 422 };

    expect((await add()).status).toBe(400);
    expect(upserts).toEqual([]);
    expect(logged).toEqual([]);
  });
});

describe("POST /api/admin-users for a staff member's role change", () => {
  it("needs no password and leaves theirs alone", async () => {
    const res = await add(null);

    expect(res.status).toBe(200);
    expect(resets).toEqual([]);
    expect(upserts).toEqual(["admin_users"]);
    expect(logged[0]).toMatchObject({ details: { password_reset: false } });
  });
});
