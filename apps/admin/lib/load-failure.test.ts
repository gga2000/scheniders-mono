// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  LOAD_RETRIES,
  LoadFailure,
  countLine,
  loadFailureKind,
  okOrLoadFailure,
  pollEvery,
  shouldRetryLoad,
} from "./load-failure";

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

describe("countLine", () => {
  const words = { loading: "loading", failed: "failed", counted: (n: number) => `${n} counted` };

  it("writes the count once the read answered, 0 included", () => {
    expect(countLine({ count: 0, isError: false }, words)).toBe("0 counted");
    expect(countLine({ count: 7, isError: false }, words)).toBe("7 counted");
  });

  it("says the read is running before it answers", () => {
    expect(countLine({ count: undefined, isError: false }, words)).toBe("loading");
  });

  it("says the read failed, not the count left from an earlier read", () => {
    expect(countLine({ count: undefined, isError: true }, words)).toBe("failed");
    expect(countLine({ count: 7, isError: true }, words)).toBe("failed");
  });
});

/*
 * Round 25 UX new 1: TanStack sets a read that never answered back to
 * pending, with no error, for every try. So a polled part that never loaded
 * swapped its failure line and Try again for a spinner on every poll.
 */
describe("a polled read that never answered", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Asks of one read over `ms`, its answers given by `answers` (true = it answers). */
  async function asksOver(ms: number, interval: number | ReturnType<typeof pollEvery>, answers: boolean[]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let asked = 0;
    const observer = new QueryObserver(client, {
      queryKey: ["polled"],
      queryFn: async () => {
        const ok = answers[Math.min(asked, answers.length - 1)];
        asked += 1;
        if (!ok) throw new LoadFailure(502, "the read");
        return asked;
      },
      refetchInterval: interval,
    });
    const stop = observer.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(ms);
    stop();
    client.clear();
    return { asked };
  }

  it("is not asked again on its own once it failed, so its failure line stays", async () => {
    // A plain interval asked again every second: a spinner each time.
    expect((await asksOver(5_500, 1_000, [false])).asked).toBe(6);
    expect((await asksOver(5_500, pollEvery(1_000), [false])).asked).toBe(1);
  });

  it("keeps polling once it holds an answer, through a failed refresh", async () => {
    // Answers, then fails: the conversation and the inbox keep looking for new messages.
    expect((await asksOver(5_500, pollEvery(1_000), [true, false])).asked).toBe(6);
  });

  it("polls again as soon as Try again brings an answer", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let asked = 0;
    const observer = new QueryObserver(client, {
      queryKey: ["polled"],
      queryFn: async () => {
        asked += 1;
        if (asked === 1) throw new LoadFailure(502, "the read");
        return asked;
      },
      refetchInterval: pollEvery(1_000),
    });
    const stop = observer.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(3_500);
    expect(asked).toBe(1);
    await observer.refetch();
    await vi.advanceTimersByTimeAsync(3_500);
    expect(asked).toBe(5);
    stop();
    client.clear();
  });
});
