// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_ACCESS_HEADERS, NO_CONSOLE_ACCESS } from "./staff-sign-in";

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

/*
 * Round 14: when the console ended a sign-in, an open page showed "Could not
 * load ... Try again" and "?" badges that could never load again, then a login
 * page with no reason. A failed answer on a browser with no session left now
 * reloads the page once, and the middleware sends it to the login page.
 */
const auth = vi.hoisted(() => ({
  session: null as { access_token: string } | null,
  error: null as Error | null,
  /** The session token's claims, as the auth client checks them. */
  claims: null as Record<string, unknown> | null,
}));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session }, error: auth.error }),
      getClaims: async () => ({ data: auth.claims ? { claims: auth.claims } : null, error: null }),
    },
  }),
}));

/** The browser's own step before a reload: it asks when a listener refused it (useLeaveGuard). */
function beforeReload(): void {
  window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
}
const reload = vi.fn(beforeReload);
beforeEach(() => {
  vi.resetModules();
  reload.mockClear();
  Object.values(toast).forEach((fn) => fn.mockClear());
  auth.error = null;
  vi.stubGlobal("location", { ...window.location, reload });
});
afterEach(() => vi.unstubAllGlobals());

/** A form with unsaved typing, as useLeaveGuard adds it. */
function typingUnsaved(): () => void {
  const ask = (event: Event) => event.preventDefault();
  window.addEventListener("beforeunload", ask);
  return () => window.removeEventListener("beforeunload", ask);
}

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

  /*
   * Round 15: a role removed while a page was open answered every read 403 with
   * the session still held, so nothing left the page: the bell and the lists
   * said "Could not check", as if the console were down.
   */
  it("leaves once when the login has no console access, however many reads fail", async () => {
    auth.session = { access_token: "jwt" };
    const noAccess = () => new Response(JSON.stringify({ error: NO_CONSOLE_ACCESS }), { status: 403, headers: NO_ACCESS_HEADERS });
    vi.stubGlobal("fetch", vi.fn(async () => noAccess()));
    const { adminFetch } = await import("./admin-fetch");
    const answers = await Promise.all(["/api/leads", "/api/notifications", "/api/stats"].map((url) => adminFetch(url)));
    expect(answers.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the page for a 403 about one permission the role lacks", async () => {
    auth.session = { access_token: "jwt" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Your role cannot do this." }), { status: 403 })));
    const { adminFetch } = await import("./admin-fetch");
    expect((await adminFetch("/api/merchants/1/pause", { method: "POST" })).status).toBe(403);
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
  });
});

/*
 * Round 16 (ux new 2): staff mid-way through a new lead when the sign-in ended
 * chose Stay on the browser's question. Nothing said why, Save answered
 * "Unauthorized", and nothing said to sign in again.
 */
describe("a page that staff chose to stay on", () => {
  let typed: () => void = () => undefined;
  afterEach(() => typed());

  it("says it is signed out and that the typing is kept, until a save goes through", async () => {
    typed = typingUnsaved();
    auth.session = null;
    const { leaveIfSignedOut } = await import("./admin-fetch");
    await leaveIfSignedOut();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    const [title, options] = toast.warning.mock.calls[0];
    expect(title).toBe("You are signed out.");
    expect(options).toMatchObject({
      duration: Infinity,
      description: "What you typed is still here. Sign in again in a new tab, then save it here.",
    });
    // Live, round 16 (#1455): under the Add Lead dialog a button in the notice
    // could not be pressed, and a click outside the dialog closes it.
    expect(options).not.toHaveProperty("action");
    expect(options).not.toHaveProperty("closeButton");
  });

  it("says nothing when the page leaves, with nothing unsaved", async () => {
    auth.session = null;
    const { leaveIfSignedOut } = await import("./admin-fetch");
    await leaveIfSignedOut();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("tells a login with no console access why", async () => {
    typed = typingUnsaved();
    auth.session = { access_token: "jwt" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403, headers: NO_ACCESS_HEADERS })));
    const { adminFetch } = await import("./admin-fetch");
    await adminFetch("/api/leads");
    expect(toast.error).toHaveBeenCalledWith(NO_CONSOLE_ACCESS, {
      id: expect.any(String),
      duration: Infinity,
      description: "This page can no longer save. Copy what you typed before you leave it.",
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("asks nothing more while staff are still signed out", async () => {
    typed = typingUnsaved();
    auth.session = null;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const { adminFetch } = await import("./admin-fetch");
    await adminFetch("/api/leads");
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    await adminFetch("/api/leads");
    await adminFetch("/api/leads", { method: "POST" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).not.toHaveBeenCalled();
  });

  it("drops the notice once a save goes through after a sign-in in another tab, and can leave again later", async () => {
    typed = typingUnsaved();
    auth.session = null;
    const answers = [401, 200, 401].map((status) => new Response(null, { status }));
    vi.stubGlobal("fetch", vi.fn(async () => answers.shift()));
    const { adminFetch } = await import("./admin-fetch");
    await adminFetch("/api/leads");
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    auth.session = { access_token: "new-jwt" };
    await adminFetch("/api/leads", { method: "POST" });
    expect(toast.dismiss).toHaveBeenCalledTimes(1);

    auth.session = null;
    await adminFetch("/api/leads");
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(toast.warning).toHaveBeenCalledTimes(2);
  });
});

/*
 * Round 16 (ux new 4): a role removed while the tab was away. The browser read
 * "no row" and signed out, and the page then reloaded to the login page with
 * no reason. It now goes to the login page that says why, and keeps the page.
 */
describe("leaveWithoutAccess", () => {
  const assign = vi.fn(beforeReload);
  beforeEach(() => assign.mockClear());
  const at = (path: string) => {
    const url = new URL(path, "https://console.test");
    vi.stubGlobal("location", { ...window.location, pathname: url.pathname, search: url.search, reload, assign });
  };

  it("goes to the login page that says this login has no access, with the page it was on", async () => {
    at("/merchants?tab=all");
    const { leaveWithoutAccess } = await import("./admin-fetch");
    leaveWithoutAccess();
    expect(assign).toHaveBeenCalledWith("/login?error=forbidden&next=%2Fmerchants%3Ftab%3Dall");
    expect(reload).not.toHaveBeenCalled();
  });

  it("leaves once, and a signed-out read after it does not reload over it", async () => {
    at("/support");
    auth.session = null;
    const { leaveWithoutAccess, leaveIfSignedOut } = await import("./admin-fetch");
    leaveWithoutAccess();
    leaveWithoutAccess();
    await leaveIfSignedOut();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps the page asked for when it starts on the login page", async () => {
    at("/login?next=%2Fleads");
    const { leaveWithoutAccess } = await import("./admin-fetch");
    leaveWithoutAccess();
    expect(assign).toHaveBeenCalledWith("/login?error=forbidden&next=%2Fleads");
  });

  it("stays on a login page that already says so, so a failed sign-out cannot send it round and round", async () => {
    at("/login?error=forbidden&next=%2Fleads");
    const { leaveWithoutAccess } = await import("./admin-fetch");
    leaveWithoutAccess();
    expect(assign).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("says why on a page staff stay on", async () => {
    const typed = typingUnsaved();
    try {
      at("/leads");
      const { leaveWithoutAccess } = await import("./admin-fetch");
      leaveWithoutAccess();
      expect(toast.error).toHaveBeenCalledWith(NO_CONSOLE_ACCESS, expect.objectContaining({ duration: Infinity }));
    } finally {
      typed();
    }
  });
});

/*
 * Round 16 (ux new 4): 52 calls went to the console's API with the browser's
 * plain fetch. They never saw a removed role's "no console access" mark, so
 * Support sat on "Could not load support conversations" for up to a minute,
 * waiting for a call that did go through adminFetch. Every call from a page
 * now does; the API's own outside calls (app/api) are not the console's.
 */
describe("the console's calls to its API", () => {
  const ADMIN_DIR = path.resolve(__dirname, "..");
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(full);
      return /\.tsx?$/.test(name) && !/\.test(-data)?\.tsx?$/.test(name) ? [full] : [];
    });
  /** Any plain fetch on a page; in lib/, a plain fetch of an /api address. */
  const PAGE_FETCH = /(?<![\w.$])fetch\(/g;
  const LIB_API_FETCH = /(?<![\w.$])fetch\(\s*["'`]\/api/g;

  it("all go through adminFetch", () => {
    const found: string[] = [];
    const scan = (files: string[], pattern: RegExp) => {
      for (const file of files) {
        const hits = readFileSync(file, "utf8").match(pattern) ?? [];
        for (const hit of hits) found.push(`${path.relative(ADMIN_DIR, file).split(path.sep).join("/")}: ${hit}`);
      }
    };
    const apiDir = path.join(ADMIN_DIR, "app", "api") + path.sep;
    scan(sourceFiles(path.join(ADMIN_DIR, "app")).filter((file) => !file.startsWith(apiDir)), PAGE_FETCH);
    scan([...sourceFiles(path.join(ADMIN_DIR, "components")), ...sourceFiles(path.join(ADMIN_DIR, "hooks"))], PAGE_FETCH);
    scan(sourceFiles(path.join(ADMIN_DIR, "lib")), LIB_API_FETCH);
    expect(found).toEqual([]);
  });
});

/*
 * Round 16 (Reliability new 5): a second tab on "Your sign-in ended" could not
 * tell the sign-in the console ended from one staff made since on another tab.
 */
describe("holdsLiveSignIn", () => {
  const HOUR = 60 * 60 * 1000;
  const signedIn = (hoursAgo: number) => ({
    sub: "u1",
    session_id: "s1",
    exp: Math.floor((Date.now() + HOUR) / 1000),
    amr: [{ method: "password", timestamp: Math.floor((Date.now() - hoursAgo * HOUR) / 1000) }],
  });
  afterEach(() => {
    auth.claims = null;
  });

  it("is true for a sign-in made since: within the age limit", async () => {
    auth.claims = signedIn(0.01);
    const { holdsLiveSignIn } = await import("./admin-fetch");
    expect(await holdsLiveSignIn()).toBe(true);
  });

  it("is false for the sign-in the console ended, still here because ending it failed", async () => {
    auth.claims = signedIn(17);
    const { holdsLiveSignIn } = await import("./admin-fetch");
    expect(await holdsLiveSignIn()).toBe(false);
  });

  it("is false with no sign-in", async () => {
    const { holdsLiveSignIn } = await import("./admin-fetch");
    expect(await holdsLiveSignIn()).toBe(false);
  });
});
