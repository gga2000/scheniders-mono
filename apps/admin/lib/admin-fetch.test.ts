// @vitest-environment jsdom
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Round 14: when the console ended a sign-in, an open page showed "Could not
 * load ... Try again" and "?" badges that could never load again, then a login
 * page with no reason. A failed answer on a browser with no session left now
 * reloads the page once, and the middleware sends it to the login page.
 */
const auth = vi.hoisted(() => ({ session: null as { access_token: string } | null, error: null as Error | null }));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    auth: { getSession: async () => ({ data: { session: auth.session }, error: auth.error }) },
  }),
}));

const reload = vi.fn();
beforeEach(() => {
  vi.resetModules();
  reload.mockClear();
  auth.error = null;
  vi.stubGlobal("location", { ...window.location, reload });
});
afterEach(() => vi.unstubAllGlobals());

describe("leaveIfSignedOut", () => {
  it("reloads once when the browser holds no session", async () => {
    auth.session = null;
    const { leaveIfSignedOut } = await import("./admin-fetch");
    await Promise.all([leaveIfSignedOut(), leaveIfSignedOut(), leaveIfSignedOut()]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves the page alone while a session is still held, so it never reloads in a loop", async () => {
    auth.session = { access_token: "jwt" };
    const { leaveIfSignedOut } = await import("./admin-fetch");
    await leaveIfSignedOut();
    expect(reload).not.toHaveBeenCalled();
  });

  /*
   * Round 15: a laptop woke with an out-of-date token on a network that passed
   * nothing. The refresh failed, the session stayed in the browser, and the page
   * reloaded onto the browser's error page with the typing lost.
   */
  it("keeps the page when the session could not be checked: a refresh that did not reach the auth server", async () => {
    auth.session = null;
    auth.error = new AuthRetryableFetchError("Failed to fetch", 0);
    const { leaveIfSignedOut } = await import("./admin-fetch");
    await leaveIfSignedOut();
    expect(reload).not.toHaveBeenCalled();
  });

  it("leaves when the auth server refused the refresh, which drops the session", async () => {
    auth.session = null;
    auth.error = new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found");
    const { leaveIfSignedOut } = await import("./admin-fetch");
    await leaveIfSignedOut();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("adminFetch", () => {
  it("checks the session after a 401, and only then", async () => {
    auth.session = null;
    const answers = [new Response(null, { status: 500 }), new Response(null, { status: 401 })];
    vi.stubGlobal("fetch", vi.fn(async () => answers.shift()));
    const { adminFetch } = await import("./admin-fetch");
    expect((await adminFetch("/api/leads")).status).toBe(500);
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
    expect((await adminFetch("/api/leads")).status).toBe(401);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
