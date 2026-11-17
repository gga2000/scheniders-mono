import { describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { STAFF_SIGN_IN_MAX_MS, bearerToken, signInEnded, verifyStaffToken } from "./staff-sign-in";

/**
 * Round 13: one staff sign-in was refreshed for 158 days, and every API read
 * asked the auth server about the token again. The token is now checked once,
 * locally, and a sign-in ends 16 hours after it was made.
 */

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const seconds = (ms: number) => Math.floor(ms / 1000);

function claims(over: Record<string, unknown> = {}) {
  return {
    sub: "11111111-1111-4111-8111-111111111111",
    session_id: "22222222-2222-4222-8222-222222222222",
    email: "staff@example.com",
    exp: seconds(NOW + HOUR),
    amr: [{ method: "password", timestamp: seconds(NOW - 2 * HOUR) }],
    ...over,
  };
}

type Answer = Awaited<ReturnType<typeof verifyStaffToken>>;
function authAnswering(data: { claims: Record<string, unknown> } | null, error: unknown = null) {
  return { getClaims: vi.fn(async () => ({ data, error })) } as unknown as Parameters<typeof verifyStaffToken>[0];
}
const check = (auth: Parameters<typeof verifyStaffToken>[0], token?: string): Promise<Answer> =>
  verifyStaffToken(auth, token, NOW);

describe("verifyStaffToken", () => {
  it("answers who it is, which session, and when it signed in", async () => {
    const auth = authAnswering({ claims: claims() });
    expect(await check(auth, "jwt")).toEqual({
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      email: "staff@example.com",
      signedInAt: seconds(NOW - 2 * HOUR) * 1000,
    });
    // Checked locally, expiry included: the library is told not to throw on it.
    expect(auth.getClaims).toHaveBeenCalledWith("jwt", { allowExpired: true });
  });

  it("takes the newest proof, so a second step counts from when it was made", async () => {
    const amr = [
      { method: "password", timestamp: seconds(NOW - 20 * HOUR) },
      { method: "totp", timestamp: seconds(NOW - HOUR) },
    ];
    expect((await check(authAnswering({ claims: claims({ amr }) })))?.signedInAt).toBe(seconds(NOW - HOUR) * 1000);
  });

  it.each([
    ["no session at all", null, null],
    ["a forged or malformed token", null, new AuthInvalidJwtError("Invalid JWT signature")],
    ["a token the auth server refused", null, new AuthApiError("invalid JWT", 401, "bad_jwt")],
    ["an expired token", { claims: claims({ exp: seconds(NOW) }) }, null],
    ["a token that does not say when it signed in", { claims: claims({ amr: [] }) }, null],
    ["a token with no session", { claims: claims({ session_id: undefined }) }, null],
    ["a token with no user", { claims: claims({ sub: "" }) }, null],
  ])("answers null for %s", async (_name, data, error) => {
    expect(await check(authAnswering(data, error), "jwt")).toBeNull();
  });

  it.each([
    ["the keys could not be read", new AuthRetryableFetchError("fetch failed", 0)],
    ["the auth server failed", new AuthApiError("internal error", 500, "unexpected_failure")],
  ])("throws when %s, instead of reading it as signed out", async (_name, error) => {
    await expect(check(authAnswering(null, error), "jwt")).rejects.toThrow(/Access-token check failed/);
  });
});

describe("signInEnded", () => {
  it("lets a whole support day through: 9 AM to midnight is 15 hours", () => {
    expect(signInEnded(NOW - 15 * HOUR, NOW)).toBe(false);
    expect(signInEnded(NOW - STAFF_SIGN_IN_MAX_MS, NOW)).toBe(false);
  });

  it("ends a sign-in past 16 hours, so the next day asks for the password again", () => {
    expect(signInEnded(NOW - STAFF_SIGN_IN_MAX_MS - 1000, NOW)).toBe(true);
    expect(signInEnded(NOW - 158 * 24 * HOUR, NOW)).toBe(true);
  });
});

describe("bearerToken", () => {
  it("reads the token adminFetch sends, and nothing else", () => {
    expect(bearerToken(new Headers({ authorization: "Bearer abc.def.ghi" }))).toBe("abc.def.ghi");
    expect(bearerToken(new Headers({ authorization: "bearer abc" }))).toBe("abc");
    expect(bearerToken(new Headers({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerToken(new Headers({ authorization: "Bearer a b" }))).toBeNull();
    expect(bearerToken(new Headers())).toBeNull();
  });
});
