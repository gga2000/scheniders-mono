// @vitest-environment jsdom
// W5.2 — loyalty on the direct-order form: redeem at checkout, earn on
// delivery (worded as such — the database credits it, never placement).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { Product } from "./types";

const runtime = {
  page_id: "product" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-10T00:00:00Z"),
};
const TENANT = "44444444-4444-4444-8444-444444444444";
const loyalty = { enabled: true, earn_per_iqd: 0.001, redeem_value_iqd: 100 };
const tenant = {
  id: TENANT,
  business_name: "متجر",
  store_config: { contact: { whatsapp_number: "07701234567" } },
  store_config_v2: { commerce: { loyalty } },
};
const product: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "عطر تجريبي",
  price: 25500,
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
};

function element(cfg: object = tenant) {
  return React.createElement(
    StoreBaseProvider,
    { base: "", children: null },
    React.createElement(pdp_direct_order.render, {
      props: pdp_direct_order.defaultProps,
      ctx: { tenant: cfg as never, runtime, products: [], categories: [], product },
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(String(url).includes("/api/loyalty/balance") ? { balance: 40 } : {}), {
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("pdp_direct_order loyalty (W5.2)", () => {
  it("states the points as earned on delivery — and only when loyalty is on", () => {
    const html = renderToStaticMarkup(element());
    expect(html).toContain('data-points-to-earn="25"');
    expect(html).toContain("تكسب 25 نقطة لما يوصلك الطلب");
    const off = renderToStaticMarkup(element({ ...tenant, store_config_v2: { commerce: {} } }));
    expect(off).not.toContain("data-points-to-earn");
  });

  it("fetches the balance for a valid phone, lets the shopper redeem, and posts redeem_points", async () => {
    render(element());
    expect(screen.queryByTestId("pdp-redeem-points")).toBeNull();
    fireEvent.change(document.querySelector('input[name="phone"]') as HTMLInputElement, {
      target: { value: "07701234567" },
    });
    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();
    });
    const box = screen.getByTestId("pdp-redeem-points");
    expect(box.textContent).toContain("عندك 40 نقطة");
    fireEvent.click(screen.getByRole("button", { name: "استخدم الكل" }));
    // 40 points × 100 IQD = 4,000 off a 25,500 subtotal.
    expect(screen.getByTestId("pdp-redeem-points").textContent).toContain("خصم −");
    expect(screen.getByTestId("pdp-redeem-points").textContent).toContain("4,000");
  });
});
