import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSessionGone } from "./session-gone";

/*
 * Round 15 (SCHENIDERS-1F): auth-js logs a refused refresh of an ended session
 * with console.error, and the server's console capture sent each one to
 * Sentry as an error, though the middleware rightly answered "signed out".
 */
const refreshGone = () => new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found");

describe("isSessionGone", () => {
  it("is the auth server saying the session has ended", () => {
    expect(isSessionGone(refreshGone())).toBe(true);
    expect(isSessionGone(new AuthApiError("Session from session_id claim in JWT does not exist", 403, "session_not_found"))).toBe(true);
  });

  it("is not any other failure", () => {
    expect(isSessionGone(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"))).toBe(false);
    expect(isSessionGone(new AuthRetryableFetchError("Failed to fetch", 0))).toBe(false);
    expect(isSessionGone(new Error("refresh_token_not_found"))).toBe(false);
    expect(isSessionGone(undefined)).toBe(false);
  });
});

const init = vi.fn();
vi.mock("@sentry/nextjs", () => ({ init, captureConsoleIntegration: () => ({ name: "CaptureConsole" }) }));

describe.each(["../sentry.server.config", "../sentry.edge.config"])("%s", (config) => {
  beforeEach(() => {
    vi.resetModules();
    init.mockClear();
  });

  it("drops an ended session and still sends, scrubbed, everything else", async () => {
    await import(config);
    const { beforeSend } = init.mock.calls[0][0] as {
      beforeSend: (event: object, hint: { originalException?: unknown }) => object | null;
    };
    expect(beforeSend({ message: "x" }, { originalException: refreshGone() })).toBeNull();
    const kept = beforeSend({ message: "Login failed for staff@example.com" }, { originalException: new Error("boom") });
    expect(kept).toEqual({ message: expect.not.stringContaining("staff@example.com") });
  });
});
