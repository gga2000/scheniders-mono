import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { AdminAuthError } from "./admin-auth-error";

/**
 * `requireAdmin` must tell a caller fault (bad token → 401, not an admin → 403)
 * apart from a server fault (auth server / admin_users lookup down → plain
 * error → 500). Only `createClient` is faked.
 */

type GetUser = () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
type Lookup = { data: { admin_role: string; is_active: boolean } | null; error: { message: string } | null };

let getUser: GetUser;
let lookup: Lookup;

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => lookup,
  };
  return {
    ...actual,
    createClient: () => ({ auth: { getUser: () => getUser() }, ...chain }),
  };
});

const USER = { id: "11111111-1111-4111-8111-111111111111" };

beforeEach(() => {
  getUser = async () => ({ data: { user: USER }, error: null });
  lookup = { data: { admin_role: "support_staff", is_active: true }, error: null };
});

async function outcome(): Promise<number | "server-error" | "ok"> {
  const { requireAdmin } = await import("./admin-supabase");
  try {
    await requireAdmin("token");
    return "ok";
  } catch (error) {
    if (error instanceof AdminAuthError) return error.status;
    return "server-error";
  }
}

describe("requireAdmin error typing", () => {
  it("an active admin resolves with their role", async () => {
    const { requireAdmin } = await import("./admin-supabase");
    await expect(requireAdmin("token")).resolves.toMatchObject({ user: USER, role: "support_staff" });
  });

  it.each([
    ["expired / invalid JWT (401)", new AuthApiError("invalid JWT", 401, "bad_jwt")],
    ["JWT for a deleted user (403)", new AuthApiError("User from sub claim in JWT does not exist", 403, "user_not_found")],
    ["missing session", new AuthSessionMissingError()],
  ])("%s → AdminAuthError 401", async (_name, error) => {
    getUser = async () => ({ data: { user: null }, error });
    expect(await outcome()).toBe(401);
  });

  it.each([
    ["network failure", new AuthRetryableFetchError("fetch failed", 0)],
    ["auth server 500", new AuthApiError("internal error", 500, "unexpected_failure")],
    ["auth rate limit 429", new AuthApiError("too many requests", 429, "over_request_rate_limit")],
  ])("%s → plain server error, not an auth status", async (_name, error) => {
    getUser = async () => ({ data: { user: null }, error });
    expect(await outcome()).toBe("server-error");
  });

  it("refuses a Claude connector (OAuth client) token before validating it → 401", async () => {
    const { requireAdmin } = await import("./admin-supabase");
    const oauthToken = `h.${Buffer.from(JSON.stringify({ sub: USER.id, client_id: "claude" })).toString("base64url")}.s`;
    getUser = vi.fn(async () => ({ data: { user: USER }, error: null }));
    await expect(requireAdmin(oauthToken)).rejects.toMatchObject({ status: 401 });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("no admin_users row → 403", async () => {
    lookup = { data: null, error: null };
    expect(await outcome()).toBe(403);
  });

  it("disabled admin → 403", async () => {
    lookup = { data: { admin_role: "super_admin", is_active: false }, error: null };
    expect(await outcome()).toBe(403);
  });

  it("unknown role → 403", async () => {
    lookup = { data: { admin_role: "merchant", is_active: true }, error: null };
    expect(await outcome()).toBe(403);
  });

  it("admin_users lookup failure → plain server error carrying the cause", async () => {
    const dbError = { message: "statement timeout" };
    lookup = { data: null, error: dbError };
    const { requireAdmin } = await import("./admin-supabase");
    const thrown = await requireAdmin("token").catch((error: unknown) => error);
    expect(thrown).not.toBeInstanceOf(AdminAuthError);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBe(dbError);
  });
});
