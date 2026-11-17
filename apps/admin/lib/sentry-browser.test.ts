// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Sentry used to load at once on every page, as one chunk that the first
 * load waited for. It held the whole SDK, session replay and the feedback
 * widget included, because the console imported the SDK as a whole. It now
 * loads after the load event, or when a screen catches an error first, and
 * only from lib/sentry-browser.ts, which names what it uses. An error
 * nothing catches before then is kept and starts it at once.
 */

const loaded = { count: 0, captureException: vi.fn() };

const ROOT = join(__dirname, "..");

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.resetModules();
  loaded.count = 0;
  loaded.captureException.mockReset();
  // Counts each time the module is evaluated, which is when Sentry starts.
  vi.doMock("./sentry-browser", () => {
    loaded.count += 1;
    return { captureException: loaded.captureException };
  });
});

afterEach(async () => {
  // Let a page that never saw its load event start Sentry now, so its
  // listeners are gone before the next test.
  setReadyState("complete");
  window.dispatchEvent(new Event("load"));
  await settle();
});

describe("starting Sentry in the browser", () => {
  it("waits for the load event", async () => {
    setReadyState("loading");
    await import("../instrumentation-client");
    await settle();
    expect(loaded.count).toBe(0);

    setReadyState("complete");
    window.dispatchEvent(new Event("load"));
    await settle();
    expect(loaded.count).toBe(1);
  });

  it("starts at once when the page has already loaded", async () => {
    setReadyState("complete");
    await import("../instrumentation-client");
    await settle();
    expect(loaded.count).toBe(1);
  });

  it("sends an error a screen caught before the load event, tagged with its boundary", async () => {
    setReadyState("loading");
    await import("../instrumentation-client");
    const { reportError } = await import("./report-error");
    const error = new Error("boom");
    reportError(error, "dashboard", { path: "/merchants" });
    await settle();
    expect(loaded.count).toBe(1);
    expect(loaded.captureException).toHaveBeenCalledWith(error, {
      tags: { boundary: "dashboard" },
      extra: { path: "/merchants" },
    });
  });
});

describe("an error nothing catches before Sentry starts", () => {
  it("is kept, starts Sentry at once and is sent", async () => {
    setReadyState("loading");
    await import("../instrumentation-client");
    const error = new Error("thrown while the page loads");
    window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
    await settle();
    expect(loaded.count).toBe(1);
    expect(loaded.captureException).toHaveBeenCalledWith(error);
  });

  it("keeps a promise refused with nobody waiting for it too", async () => {
    setReadyState("loading");
    await import("../instrumentation-client");
    const reason = new Error("a read failed while the page loads");
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));
    await settle();
    expect(loaded.captureException).toHaveBeenCalledWith(reason);
  });

  it("is left to Sentry's own listeners once it has started, so nothing is sent twice", async () => {
    setReadyState("complete");
    await import("../instrumentation-client");
    await settle();
    // Stands in for Sentry's own listener, which takes the error from here.
    const sentryOwn = (event: Event) => event.preventDefault();
    window.addEventListener("error", sentryOwn);
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("later"), message: "later", cancelable: true }));
    window.removeEventListener("error", sentryOwn);
    await settle();
    expect(loaded.count).toBe(1);
    expect(loaded.captureException).not.toHaveBeenCalled();
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(ROOT).map((path) => ({ rel: relative(ROOT, path), text: readFileSync(path, "utf8") }));

describe("where Sentry is imported", () => {
  it("only the server set-up, the server logger and lib/sentry-browser.ts import the SDK", () => {
    const importers = files.filter((f) => /@sentry\/nextjs/.test(f.text)).map((f) => f.rel).sort();
    expect(importers).toEqual([
      "instrumentation.ts",
      "lib/activity-logger.ts",
      "lib/sentry-browser.ts",
      "next.config.ts",
      "sentry.edge.config.ts",
      "sentry.server.config.ts",
    ]);
  });

  it("the server logger, which imports the whole SDK, is used only by API routes", () => {
    const users = files.filter((f) => /from "(@\/lib|\.)\/activity-logger"/.test(f.text)).map((f) => f.rel);
    expect(users.length).toBeGreaterThan(0);
    expect(users.filter((rel) => !rel.startsWith("app/api/"))).toEqual([]);
  });

  it("the browser half names what it uses, so the rest of the SDK stays out of the bundle", () => {
    const text = files.find((f) => f.rel === "lib/sentry-browser.ts")?.text ?? "";
    expect(text).toMatch(/^import \{ captureException, init \} from "@sentry\/nextjs";$/m);
    expect(text).not.toMatch(/import\(\s*"@sentry\/nextjs"\s*\)|import \* as/);
  });
});
