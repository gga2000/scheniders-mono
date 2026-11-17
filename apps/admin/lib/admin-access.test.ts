import { describe, expect, it } from "vitest";
import { nextAccess, readAccessCheck } from "./admin-access";

/*
 * The browser read the person's own staff row on every sign-in event and took
 * a failed read for "no access": a 10-second blip during the hourly token
 * refresh signed a support agent out of every device, with no message.
 */

describe("reading the person's own staff row", () => {
  it("gives the role of an active row", () => {
    expect(readAccessCheck({ data: { admin_role: "support_staff", is_active: true }, error: null })).toEqual({
      kind: "role",
      role: "support_staff",
    });
  });

  it("says no access for no row, an inactive row or a role the console does not know", () => {
    expect(readAccessCheck({ data: null, error: null })).toEqual({ kind: "none" });
    expect(readAccessCheck({ data: { admin_role: "super_admin", is_active: false }, error: null })).toEqual({ kind: "none" });
    expect(readAccessCheck({ data: { admin_role: "sales_agent", is_active: true }, error: null })).toEqual({ kind: "none" });
  });

  it("says the read failed when it failed, whatever came back with the error", () => {
    expect(readAccessCheck({ data: null, error: { message: "Failed to fetch" } })).toEqual({ kind: "failed" });
    expect(readAccessCheck({ data: { admin_role: "super_admin", is_active: true }, error: { code: "503" } })).toEqual({
      kind: "failed",
    });
  });
});

describe("what a check does to the person's session", () => {
  const known = { userId: "u1", role: "support_staff" as const };

  it("signs out only when the row answered no", () => {
    expect(nextAccess({ kind: "none" }, known, "u1")).toEqual({ kind: "sign_out" });
    expect(nextAccess({ kind: "failed" }, known, "u1").kind).not.toBe("sign_out");
    expect(nextAccess({ kind: "failed" }, null, "u1").kind).not.toBe("sign_out");
  });

  it("keeps the role it knows for the same person when a read fails", () => {
    expect(nextAccess({ kind: "failed" }, known, "u1")).toEqual({ kind: "keep", role: "support_staff" });
  });

  it("does not lend one person's role to another when a read fails", () => {
    expect(nextAccess({ kind: "failed" }, known, "u2")).toEqual({ kind: "unknown" });
  });

  it("takes the role the row gives", () => {
    expect(nextAccess({ kind: "role", role: "super_admin" }, known, "u1")).toEqual({ kind: "grant", role: "super_admin" });
  });
});
