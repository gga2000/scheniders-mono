// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Every failed read and save in the browser asks whether the browser still
 * holds a session (leaveIfSignedOut). Pages read through TanStack, many with a
 * plain fetch, so this wiring is what takes an ended sign-in to the login page.
 */
const leaveIfSignedOut = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./admin-fetch", () => ({ leaveIfSignedOut }));

import { getQueryClient } from "./query-client";

beforeEach(() => leaveIfSignedOut.mockClear());

describe("the browser's query client", () => {
  it("is one client for the whole visit", () => {
    expect(getQueryClient()).toBe(getQueryClient());
  });

  it("asks about the session after a failed read", async () => {
    await getQueryClient().prefetchQuery({
      queryKey: ["test", "failed read"],
      queryFn: () => Promise.reject(new Error("Could not load")),
      retry: false,
    });
    expect(leaveIfSignedOut).toHaveBeenCalledTimes(1);
  });

  it("asks about the session after a failed save", async () => {
    const save = getQueryClient().getMutationCache().build(getQueryClient(), {
      mutationFn: () => Promise.reject(new Error("Could not save")),
    });
    await expect(save.execute(undefined)).rejects.toThrow("Could not save");
    expect(leaveIfSignedOut).toHaveBeenCalledTimes(1);
  });
});
