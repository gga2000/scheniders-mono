// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hasPermission } from "@/lib/admin-permissions";
import { TRIAL_CHECKS_KEY, type TrialCheck, type TrialChecksResponse } from "@/lib/trial-checks";
import { TRIAL_FOLLOW_UP_KEY } from "@/lib/trial-pipeline";
import type { AdminAction } from "@/types/admin";

/*
 * Round 21 (structure new 7): Extend on Trials and the one-trial decisions
 * held their ids in one button's memory, and read a refusal with
 * `res.json()`. A reload, or the shop page's free trial days for the same
 * shop, sent a new id, so a trial whose answer was lost could get its days
 * twice; and a gateway's text answer showed the JSON parser's words. They now
 * keep their ids in the browser like every other money or free-time ask, and
 * say a lost answer the same way.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useCan: () => (action: AdminAction) => hasPermission("super_admin", action),
}));

const { default: TrialsPage } = await import("@/app/(dashboard)/trials/page");
const { TrialChecksPanel } = await import("./trial-checks-panel");
const { ANSWER_LOST } = await import("@/components/merchants/detail/action-ui");
const { keptRequestIds, requestKey, shopKey } = await import("@/lib/request-ids");

const SHOP = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const REASON = "Owner asked on WhatsApp for more days";
const lost = () => Promise.resolve(new Response("An error occurred with your deployment", { status: 504 }));

/** The request id the last POST carried. */
function sentId(): string {
  const posted = send.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
  expect(posted).toHaveLength(1);
  return JSON.parse(String((posted[0][1] as RequestInit).body)).request_id;
}

function draw(client: QueryClient, element: Parameters<typeof createElement>[0]) {
  return render(createElement(QueryClientProvider, { client }, createElement(element)));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  send.mockReset();
});

describe("Extend on Trials", () => {
  it("keeps a lost extension's id where the shop page's free trial days find it, and says the answer was lost", async () => {
    send.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "POST" ? lost() : Promise.resolve(new Response(JSON.stringify({ trials: [] }))),
    );
    const client = new QueryClient();
    client.setQueryData(["admin", "trials"], {
      trials: [
        {
          id: SHOP,
          business_name: "Najaf Gifts",
          slug: "najaf-gifts",
          plan: "starter",
          status: "trial",
          trial_ends_at: "2026-11-25T09:00:00.000Z",
          city: "Najaf",
          contact_email: null,
          created_at: "2026-11-18T09:00:00.000Z",
          balance_iqd: 0,
          days_remaining: 3,
          is_expired: false,
          paused: false,
        },
      ],
      summary: { total: 1, expiringSoon: 1, expired: 0, healthy: 0 },
    });
    client.setQueryData(TRIAL_FOLLOW_UP_KEY, []);
    client.setQueryData<TrialChecksResponse>(TRIAL_CHECKS_KEY, { checks: [], summary: { needs_look: 0, no_trial: 0, review: 0 } });
    draw(client, TrialsPage);

    fireEvent.click(screen.getByRole("button", { name: "Extend" }));
    fireEvent.change(screen.getByPlaceholderText("Why? (saved in the log)"), { target: { value: REASON } });
    fireEvent.click(screen.getByRole("button", { name: "+7 days" }));

    expect(await screen.findByText(ANSWER_LOST)).toBeTruthy();
    expect(screen.queryByText(/JSON/)).toBeNull();
    // The shop page's Give free trial days asks for "this shop, trial, 7 days" the same way.
    expect(keptRequestIds("free-days").idFor(requestKey(shopKey(SHOP), "trial", 7))).toBe(sentId());
  });
});

describe("a one-trial decision", () => {
  it("keeps a lost decision's id past a reload, and says the answer was lost", async () => {
    const check: TrialCheck = {
      tenant_id: SHOP,
      verdict: "no_trial",
      trial_withheld_at: null,
      staff_decision: null,
      staff_reason: null,
      decided_by_email: null,
      decided_at: null,
      created_at: "2026-11-18T09:00:00.000Z",
      updated_at: "2026-11-18T09:00:00.000Z",
      store: {
        id: SHOP,
        business_name: "Najaf Gifts",
        display_id: 100095,
        status: "trial",
        restrictions: null,
        trial_ends_at: "2026-11-25T09:00:00.000Z",
        contact_phone: null,
        created_at: "2026-11-18T09:00:00.000Z",
      },
      matches: [],
      needs_look: true,
    };
    const checks: TrialChecksResponse = { checks: [check], summary: { needs_look: 1, no_trial: 1, review: 0 } };
    // A failed decision reads the list again (someone may have decided it meanwhile).
    send.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "POST" ? lost() : Promise.resolve(new Response(JSON.stringify(checks))),
    );
    const client = new QueryClient();
    client.setQueryData(TRIAL_CHECKS_KEY, checks);
    draw(client, TrialChecksPanel);

    fireEvent.change(screen.getByPlaceholderText("Why? (saved in the log)"), { target: { value: REASON } });
    fireEvent.click(screen.getByRole("button", { name: "Give back 3 days" }));

    expect(await screen.findByText(ANSWER_LOST)).toBeTruthy();
    // A new handle, as after a reload: the same ask finds the same id.
    expect(keptRequestIds("trial-check").idFor(requestKey(shopKey(SHOP), "allow_trial", 3))).toBe(sentId());
  });
});
