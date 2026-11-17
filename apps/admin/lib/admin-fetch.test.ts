// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Round 14: when the console ended a sign-in, an open page showed "Could not
 * load ... Try again" and "?" badges that could never load again, then a login
 * page with no reason. A failed answer on a browser with no session left now
 * reloads the page once, and the middleware sends it to the login page.
 */
const auth = vi.hoisted(() => ({ session: null as { access_token: string } | null }));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: auth.session } }) } }),
}));

const reload = vi.fn();
beforeEach(() => {
  vi.resetModules();
  reload.mockClear();
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
