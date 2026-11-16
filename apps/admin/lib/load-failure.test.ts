import { describe, expect, it } from "vitest";
import { LOAD_RETRIES, LoadFailure, loadFailureKind, okOrLoadFailure, shouldRetryLoad } from "./load-failure";

/*
 * Round 1 of the staff console audit: a support login opening Billing got a
 * 403 and the page drew "0 IQD, No wallets found"; a server error on a shop
 * page read "Merchant not found". A page now knows why its read failed.
 */

const answer = (status: number) => new Response(status === 204 ? null : "{}", { status });

describe("okOrLoadFailure", () => {
  it("hands back a successful answer untouched", () => {
    const response = answer(200);
    expect(okOrLoadFailure(response, "billing")).toBe(response);
  });

  it("throws the status of an answer that is not a success", () => {
    for (const status of [401, 403, 404, 500, 503]) {
      let thrown: unknown;
      try {
        okOrLoadFailure(answer(status), "billing");
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(LoadFailure);
      expect((thrown as LoadFailure).status).toBe(status);
      expect((thrown as LoadFailure).message).toBe(`Could not load billing: the server answered ${status}`);
    }
  });
});

describe("loadFailureKind", () => {
  it("tells a refused login, an ended sign-in and a missing record from a broken server", () => {
    expect(loadFailureKind(new LoadFailure(401, "x"))).toBe("signed_out");
    expect(loadFailureKind(new LoadFailure(403, "x"))).toBe("forbidden");
    expect(loadFailureKind(new LoadFailure(404, "x"))).toBe("missing");
    expect(loadFailureKind(new LoadFailure(500, "x"))).toBe("failed");
    expect(loadFailureKind(new LoadFailure(429, "x"))).toBe("failed");
  });

  it("counts a dropped connection, or anything unknown, as a failure worth another try", () => {
    expect(loadFailureKind(new TypeError("Failed to fetch"))).toBe("failed");
    expect(loadFailureKind(undefined)).toBe("failed");
    expect(loadFailureKind("boom")).toBe("failed");
  });
});

describe("shouldRetryLoad", () => {
  it("asks a broken server again, up to the limit", () => {
    const broken = new LoadFailure(500, "x");
    expect(shouldRetryLoad(0, broken)).toBe(true);
    expect(shouldRetryLoad(LOAD_RETRIES - 1, broken)).toBe(true);
    expect(shouldRetryLoad(LOAD_RETRIES, broken)).toBe(false);
    expect(shouldRetryLoad(0, new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not ask again when the answer cannot change", () => {
    for (const status of [401, 403, 404]) {
      expect(shouldRetryLoad(0, new LoadFailure(status, "x"))).toBe(false);
    }
  });
});
