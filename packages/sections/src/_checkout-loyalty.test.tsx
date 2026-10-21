// @vitest-environment jsdom
// Loyalty on the cart checkout: the balance is fetched only with a previous
// order number of the shopper's phone (the route answers nothing without it).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import { useCart } from "./helpers/cart-store";
import checkout_form from "./checkout_form";

const runtime = {
  page_id: "checkout" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-10T00:00:00Z"),
};
const TENANT = "44444444-4444-4444-8444-444444444444";
const tenant = {
  id: TENANT,
  business_name: "متجر",
  store_config: { contact: { whatsapp_number: "07701234567" } },
  store_config_v2: { commerce: { loyalty: { enabled: true, earn_per_iqd: 0.001, redeem_value_iqd: 100 } } },
};

function element() {
  return React.createElement(
    StoreBaseProvider,
    { base: "", children: null },
    React.createElement(checkout_form.render, {
      props: checkout_form.defaultProps,
      ctx: { tenant: tenant as never, runtime, products: [], categories: [] },
    }),
  );
}

const balanceCalls = () =>
  vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/api/loyalty/balance"));

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(700);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  window.localStorage.clear();
  useCart.getState().clearCart();
  useCart.getState().addItem({
    product_id: "11111111-1111-4111-8111-111111111111",
    variant_id: null,
    name: "عطر",
    variant_name: null,
    price: 25500,
    quantity: 1,
    image_url: null,
  });
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

describe("checkout_form loyalty", () => {
  it("does not look a phone up without a previous order number", async () => {
    render(element());
    fireEvent.change(document.querySelector('input[name="phone"]') as HTMLInputElement, {
      target: { value: "07701234567" },
    });
    await settle();
    expect(screen.getByTestId("checkout-points-order").textContent).toContain("رقم طلب سابق");
    expect(balanceCalls()).toEqual([]);
    expect(screen.queryByText(/لديك 40 نقطة/)).toBeNull();
  });

  it("shows the balance once the order number is in, and POSTs the proof", async () => {
    render(element());
    fireEvent.change(document.querySelector('input[name="phone"]') as HTMLInputElement, {
      target: { value: "07701234567" },
    });
    fireEvent.change(document.querySelector('input[name="loyalty_order_number"]') as HTMLInputElement, {
      target: { value: "4260910007" },
    });
    await settle();
    const [, init] = balanceCalls()[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      tenant_id: TENANT,
      phone: "07701234567",
      order_number: "4260910007",
    });
    expect(screen.getByText(/لديك 40 نقطة/)).toBeTruthy();
  });
});
