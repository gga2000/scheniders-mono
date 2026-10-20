// @vitest-environment jsdom
// W5.3 — the thank-you page's referral share. The code is minted with the
// checkout's signed proof from this browser's stash; nothing the buyer typed
// (their phone) is sent, and without the proof nothing is asked for.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, cleanup, act } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import order_confirmation from "./order_confirmation";

const ORDER = "11111111-1111-4111-8111-111111111111";
const runtime = {
  page_id: "checkout_success" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-10T00:00:00Z"),
  order_number: "SH-0001",
};
const tenant = {
  id: "44444444-4444-4444-8444-444444444444",
  business_name: "متجر",
  store_config: { contact: { whatsapp_number: "07701234567" } },
  store_config_v2: {
    commerce: {
      loyalty: { enabled: true, earn_per_iqd: 0.001 },
      referral: { enabled: true, friend_discount_pct: 10, referrer_points: 50 },
    },
  },
};

function stash(over: Record<string, unknown> = {}): void {
  window.sessionStorage.setItem(
    "schn:last-order",
    JSON.stringify({ number: "SH-0001", order_id: ORDER, items: [], total: 1000, ts: Date.now(), ...over }),
  );
}

function mount(): void {
  render(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(order_confirmation.render, {
        props: order_confirmation.defaultProps,
        ctx: { tenant: tenant as never, runtime, products: [], categories: [] },
      }),
    ),
  );
}

const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
  Promise.resolve(new Response(JSON.stringify({ code: "AB3K7M" }), { headers: { "content-type": "application/json" } })),
);

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("order_confirmation referral share", () => {
  it("mints with the checkout's proof and shows the code", async () => {
    stash({ upsell_token: "v1.payload.sig" });
    await act(async () => {
      mount();
    });
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/referral/code");
    expect(call).toBeTruthy();
    const init = call?.[1];
    expect(new Headers(init?.headers).get("x-upsell-proof")).toBe("v1.payload.sig");
    expect(JSON.parse(String(init?.body))).toEqual({ order_id: ORDER });
    expect(document.querySelector('[data-testid="referral-share"]')?.textContent).toContain("AB3K7M");
  });

  it("asks for nothing without a proof", async () => {
    stash({ phone: "07701234567" });
    await act(async () => {
      mount();
    });
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/referral/code")).toBe(false);
    expect(document.querySelector('[data-testid="referral-share"]')).toBeNull();
  });
});
