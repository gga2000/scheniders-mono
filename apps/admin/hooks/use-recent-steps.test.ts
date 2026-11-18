import { describe, expect, it } from "vitest";
import { LoadFailure } from "@/lib/load-failure";
import { RECENT_STEPS, readRecentSteps } from "./use-recent-steps";

/*
 * Round 5 of the staff console audit: the bell listed steps only after Home
 * had loaded; on any other page it said "No notifications yet".
 */

const step = {
  id: "l1",
  action: "status_change",
  details: { status: "active" },
  tenant_id: "s1",
  admin_user_id: "a1",
  created_at: "2026-11-17T01:00:00Z",
  business_name: "Kawkab",
};

function answering(status: number, body: unknown) {
  const asked: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetcher, asked };
}

describe("readRecentSteps", () => {
  it("asks the Activity log for the newest steps itself, on any page", async () => {
    const { fetcher, asked } = answering(200, { logs: [step], total: 1, page: 1, limit: RECENT_STEPS });

    const steps = await readRecentSteps(fetcher);

    expect(asked).toEqual([`/api/activity?limit=${RECENT_STEPS}&count=none`]);
    expect(steps).toEqual([
      {
        id: "l1",
        action: "status_change",
        details: { status: "active" },
        tenant_id: "s1",
        business_name: "Kawkab",
        created_at: "2026-11-17T01:00:00Z",
      },
    ]);
  });

  it("names the shop a step was about, and none for a step about no shop", async () => {
    // The bell showed the raw detail values ("cancelled · 3f2a..."), never the shop.
    // undefined leaves the key out of the JSON, as the API does for a step about no shop.
    const { fetcher } = answering(200, { logs: [step, { ...step, id: "l2", tenant_id: null, business_name: undefined }] });

    const steps = await readRecentSteps(fetcher);

    expect(steps.map((s) => s.business_name)).toEqual(["Kawkab", null]);
  });

  it("reads details that are not an object as none", async () => {
    const { fetcher } = answering(200, { logs: [{ ...step, details: "text" }, { ...step, id: "l2", details: null }] });

    const steps = await readRecentSteps(fetcher);

    expect(steps.map((s) => s.details)).toEqual([null, null]);
  });

  it("fails with the server's status, so the bell never shows an empty list for a failed read", async () => {
    const { fetcher } = answering(500, { error: "x" });

    await expect(readRecentSteps(fetcher)).rejects.toBeInstanceOf(LoadFailure);
  });
});
