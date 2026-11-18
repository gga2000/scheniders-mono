import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { AdminAuthError } from "./admin-auth-error";
import { SIGN_IN_ENDED } from "./staff-sign-in";

/**
 * `requireAdmin` must tell a caller fault (bad or old token → 401, not an
 * admin → 403) apart from a server fault (keys or admin_users lookup down →
 * plain error → 500). The token is checked locally (`getClaims`), once; the
 * auth server is asked by the middleware. Only `createClient` is faked.
 */

type GetClaims = () => Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }>;
type Lookup = { data: { admin_role: string; is_active: boolean } | null; error: { message: string } | null };

let getClaims: GetClaims;
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
    createClient: () => ({ auth: { getClaims: () => getClaims() }, ...chain }),
  };
});

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "staff@example.com" };
const HOUR = 60 * 60 * 1000;
const seconds = (ms: number) => Math.floor(ms / 1000);

/** A staff token that signed in `signedInHoursAgo` hours ago. */
function claims(signedInHoursAgo = 1) {
  return {
    sub: USER.id,
    session_id: "22222222-2222-4222-8222-222222222222",
    email: USER.email,
    exp: seconds(Date.now() + HOUR),
    amr: [{ method: "password", timestamp: seconds(Date.now() - signedInHoursAgo * HOUR) }],
  };
}

beforeEach(() => {
  getClaims = async () => ({ data: { claims: claims() }, error: null });
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
    ["forged or malformed JWT", async () => ({ data: null, error: new AuthInvalidJwtError("Invalid JWT signature") })],
    ["token the auth server refused", async () => ({ data: null, error: new AuthApiError("invalid JWT", 401, "bad_jwt") })],
    ["JWT for a deleted user (403)", async () => ({ data: null, error: new AuthApiError("User from sub claim in JWT does not exist", 403, "user_not_found") })],
    ["expired JWT", async () => ({ data: { claims: { ...claims(), exp: seconds(Date.now() - 1000) } }, error: null })],
    ["JWT that does not say when it signed in", async () => ({ data: { claims: { ...claims(), amr: [] } }, error: null })],
  ] satisfies [string, GetClaims][])("%s → AdminAuthError 401", async (_name, answer) => {
    getClaims = answer;
    expect(await outcome()).toBe(401);
  });

  it.each([
    ["keys could not be read", new AuthRetryableFetchError("fetch failed", 0)],
    ["auth server 500", new AuthApiError("internal error", 500, "unexpected_failure")],
    ["auth rate limit 429", new AuthApiError("too many requests", 429, "over_request_rate_limit")],
  ])("%s → plain server error, not an auth status", async (_name, error) => {
    getClaims = async () => ({ data: null, error });
    expect(await outcome()).toBe("server-error");
  });

  it("ends a sign-in older than 16 hours → 401 that says so", async () => {
    getClaims = async () => ({ data: { claims: claims(17) }, error: null });
    const { requireAdmin } = await import("./admin-supabase");
    await expect(requireAdmin("token")).rejects.toMatchObject({ status: 401, message: SIGN_IN_ENDED });
  });

  it("lets a sign-in from the start of the support day through", async () => {
    getClaims = async () => ({ data: { claims: claims(15) }, error: null });
    expect(await outcome()).toBe("ok");
  });

  it("refuses a Claude connector (OAuth client) token before validating it → 401", async () => {
    const { requireAdmin } = await import("./admin-supabase");
    const oauthToken = `h.${Buffer.from(JSON.stringify({ sub: USER.id, client_id: "claude" })).toString("base64url")}.s`;
    getClaims = vi.fn(async () => ({ data: { claims: claims() }, error: null }));
    await expect(requireAdmin(oauthToken)).rejects.toMatchObject({ status: 401 });
    expect(getClaims).not.toHaveBeenCalled();
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
