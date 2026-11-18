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
/** The email's user_profiles row; null for a login whose profile was never saved. */
let profileRow: { id: string; display_name: string } | null;
let profileLookupError: { message: string } | null;
let listUsersError: { message: string } | null;
let created: string[];
/** A failed read of the admin_users row. */
let staffReadError: { message: string } | null;
/** admin_users rows deleted. */
let deleted: number;

function from(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () =>
      table === "user_profiles"
        ? { data: profileLookupError ? null : profileRow, error: profileLookupError }
        : { data: staffReadError ? null : staffRow, error: staffReadError },
    upsert: async () => {
      upserts.push(table);
      return { error: null };
    },
    delete: () => {
      deleted += 1;
      return { eq: async () => ({ error: null }) };
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
      listUsers: async () =>
        listUsersError
          ? { data: { users: [] }, error: listUsersError }
          : { data: { users: [{ id: "u1", email: "Noor@b.co" }] }, error: null },
      createUser: async ({ email }: { email: string }) => {
        created.push(email);
        return { data: { user: { id: "new" } }, error: null };
      },
    },
  },
};
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => client }));

const { DELETE, POST } = await import("./route");
const send = (body: unknown) =>
  POST(new NextRequest("http://admin.test/api/admin-users", { method: "POST", body: JSON.stringify(body) }));
const add = (password: string | null = "new-password-1") =>
  send({ email: "noor@b.co", adminRole: "support_staff", password });

beforeEach(() => {
  resetError = null;
  upserts = [];
  resets = [];
  staffRow = { user_id: "u1" };
  profileRow = { id: "u1", display_name: "Noor" };
  profileLookupError = null;
  listUsersError = null;
  created = [];
  staffReadError = null;
  deleted = 0;
  logged.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
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

describe("POST /api/admin-users when the login has no profile row", () => {
  beforeEach(() => {
    profileRow = null;
  });

  it("writes the profile before granting access, so the person's Team page and name work", async () => {
    // The first try created the login but could not save the profile; staff added the person again.
    staffRow = null;
    const res = await add();

    expect(res.status).toBe(200);
    expect(created).toEqual([]);
    expect(resets).toEqual(["u1"]);
    expect(upserts).toEqual(["user_profiles", "admin_users"]);
  });

  it("stops, and creates no second login, when the login list cannot be read", async () => {
    listUsersError = { message: "auth down" };

    expect((await add()).status).toBe(500);
    expect(created).toEqual([]);
    expect(upserts).toEqual([]);
    expect(logged).toEqual([]);
  });
});

describe("POST /api/admin-users when a read fails or the form is wrong", () => {
  it("stops when the profile lookup fails, instead of treating the email as new", async () => {
    profileLookupError = { message: "timeout" };

    expect((await add()).status).toBe(500);
    expect(resets).toEqual([]);
    expect(created).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it.each([
    ["no email", { adminRole: "support_staff" }, "A valid email is required"],
    ["a role that does not exist", { email: "noor@b.co", adminRole: "owner" }, "adminRole must be 'super_admin' or 'support_staff'"],
    ["a short password", { email: "noor@b.co", adminRole: "support_staff", password: "short" }, "Password must be at least 8 characters"],
    ["no body", null, "A valid email is required"],
  ])("refuses %s with a plain reason", async (_name, body, error) => {
    const res = await send(body);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(error);
    expect(upserts).toEqual([]);
  });
});

// Round 11: a failed read of the admin row answered 404 "Not an admin user".
describe("DELETE /api/admin-users", () => {
  const STAFF_ID = "11111111-1111-4111-8111-111111111111";
  const remove = (userId = STAFF_ID) =>
    DELETE(new NextRequest(`http://admin.test/api/admin-users?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }));

  it("removes a staff member's access and logs it", async () => {
    const res = await remove();

    expect(res.status).toBe(200);
    expect(deleted).toBe(1);
    expect(logged.map((entry) => entry.action)).toEqual(["remove_admin_access"]);
  });

  // Round 13: an id that is not a uuid reached the database, which refused to
  // compare it, and the answer was a 500 "Could not read this admin".
  it("answers 404 for an id that is not a login id, without asking the database", async () => {
    staffReadError = { message: 'invalid input syntax for type uuid: "u1"' };

    for (const id of ["u1", "1", "not-a-uuid", `${STAFF_ID}x`]) {
      const res = await remove(id);
      expect(res.status, id).toBe(404);
      expect((await res.json()).error).toBe("Not an admin user");
    }
    expect(deleted).toBe(0);
  });

  it("says the read failed, and removes nothing, when the admin row cannot be read", async () => {
    staffReadError = { message: "timeout" };

    const res = await remove();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Could not read this admin. Try again.");
    expect(deleted).toBe(0);
    expect(logged).toEqual([]);
  });

  it("answers 404 for a person who is not staff", async () => {
    staffRow = null;

    expect((await remove()).status).toBe(404);
    expect(deleted).toBe(0);
  });
});
