// @vitest-environment jsdom
// W5.3 — a friend's code on the direct-order form: captured from ?ref=,
// previewed through the server's verdict, sent only when valid.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { writeCapturedReferral } from "./helpers/referral-capture";
import pdp_direct_order from "./pdp_direct_order";
import type { Product } from "./types";

const runtime = { page_id: "product" as const, breakpoint: "mobile" as const, locale: "ar" as const, audience_segments: [], ab_test_arms: {}, now: new Date("2026-09-10T00:00:00Z") };
const TENANT = "66666666-6666-4666-8666-666666666666";
const tenant = {
  id: TENANT,
  business_name: "متجر",
  store_config: { contact: { whatsapp_number: "07701234567" } },
  store_config_v2: { commerce: { referral: { enabled: true, friend_discount_pct: 10, friend_max_discount_iqd: 5000 } } },
};
const product: Product = { id: "11111111-1111-4111-8111-111111111111", name: "عطر تجريبي", price: 25000, stock_quantity: 10, reserved_quantity: 0, is_archived: false };

function element(cfg: object = tenant) {
  return React.createElement(
    StoreBaseProvider,
    { base: "", children: null },
    React.createElement(pdp_direct_order.render, { props: pdp_direct_order.defaultProps, ctx: { tenant: cfg as never, runtime, products: [], categories: [], product } }),
  );
}
const flush = async () => {
  await act(async () => {
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = new URL(String(url), "http://x");
      let body: unknown = {};
      if (u.pathname === "/api/referral/validate") {
        const code = u.searchParams.get("code");
        const phone = u.searchParams.get("phone");
        body = code !== "AB3K7M" ? { valid: false, reason: "unknown" }
          // The API no longer distinguishes *why* a phone is ineligible — that
          // was an oracle over a stranger's order history. See the note in
          // `app/api/referral/validate/route.ts`.
          : phone === "07701111111" ? { valid: false, reason: "ineligible" }
          : { valid: true, friend_discount_pct: 10, friend_max_discount_iqd: 5000 };
      }
      return Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
    }),
  );
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("pdp_direct_order referral field (W5.3)", () => {
  it("renders the field only when the program is on, never on the server with a code", () => {
    expect(renderToStaticMarkup(element())).toContain('data-testid="referral-field"');
    expect(renderToStaticMarkup(element({ ...tenant, store_config_v2: { commerce: {} } }))).not.toContain('data-testid="referral-field"');
  });

  it("picks the code up from a shared link and previews the friend's discount", async () => {
    window.history.replaceState(null, "", "/?ref=ab3k7m");
    render(element());
    const input = document.querySelector('input[name="referral_code"]') as HTMLInputElement;
    expect(input.value).toBe("AB3K7M");
    await flush();
    const status = document.querySelector("[data-referral-state]") as HTMLElement;
    expect(status.dataset.referralState).toBe("valid");
    expect(status.textContent).toContain("2,500"); // 10 % of 25,000
    window.history.replaceState(null, "", "/");
  });

  it("remembers a captured code from an earlier page and says a rejected one will not work", async () => {
    writeCapturedReferral(TENANT, "AB3K7M");
    render(element());
    fireEvent.change(document.querySelector('input[name="phone"]') as HTMLInputElement, { target: { value: "07701111111" } });
    await flush();
    const status = document.querySelector("[data-referral-state]") as HTMLElement;
    expect(status.dataset.referralState).toBe("invalid");
    expect(status.textContent).toContain("هذا الرمز ما ينفع مع هذا الرقم");
    fireEvent.change(document.querySelector('input[name="referral_code"]') as HTMLInputElement, { target: { value: "ZZZZZZ" } });
    await flush();
    expect((document.querySelector("[data-referral-state]") as HTMLElement).textContent).toContain("ما نعرف هذا الرمز");
    expect(screen.getByTestId("referral-field")).toBeTruthy();
  });
});
