import { describe, expect, it, vi } from "vitest";

/*
 * Round 15: the Settings page's server render ran a read, it failed (the server
 * holds no session), and the shared client's onError called the browser's
 * page reload on the server: "window is not defined" in Sentry on every new
 * server instance. A server render's client never leaves, and is its own.
 */
const leaveIfSignedOut = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./admin-fetch", () => ({ leaveIfSignedOut }));

import { getQueryClient } from "./query-client";

describe("the query client in a server render", () => {
  it("is new for each render, so no request's cache is kept for the next", () => {
    expect(getQueryClient()).not.toBe(getQueryClient());
  });

  it("never leaves for the login page after a failed read", async () => {
    await getQueryClient().prefetchQuery({
      queryKey: ["test", "failed read"],
      queryFn: () => Promise.reject(new Error("Could not load")),
      retry: false,
    });
    expect(leaveIfSignedOut).not.toHaveBeenCalled();
  });
});
