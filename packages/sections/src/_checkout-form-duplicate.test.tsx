// @vitest-environment jsdom
// =====================================================================
// checkout_form — the soft duplicate guard's answer (spec 2026-10-21 §2)
// =====================================================================
// The server returns an existing order instead of a new one when this phone
// ordered these products minutes ago. The cart form must say so: no second
// Purchase, no thank-you page, and the cart is kept (nothing new was placed).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { CartItem } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import { useCart } from "./helpers/cart-store";
import checkout_form from "./checkout_form";
import { fixtureTenant, productRuntime } from "./_pdp-fixtures";

const LINE: CartItem = {
  product_id: "22222222-2222-4222-8222-222222222222",
  variant_id: null,
  name: "عطر تجريبي",
  variant_name: null,
  price: 18000,
  quantity: 1,
  image_url: null,
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useCart.setState({ items: [LINE] });
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useCart.setState({ items: [] });
});

describe("checkout_form duplicate answer", () => {
  it("says the order is already in, fires no Purchase, keeps the cart and stays on the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/checkout/orders"
          ? new Response(JSON.stringify({ success: true, replayed: true, duplicate: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : new Response("{}", { headers: { "content-type": "application/json" } }),
      ),
    );
    const Section = checkout_form.render;
    const view = render(
      <StoreBaseProvider base="/s/fixture-store">
        <Section
          props={checkout_form.defaultProps}
          ctx={{
            tenant: fixtureTenant,
            runtime: { ...productRuntime, page_id: "checkout" },
            products: [],
            categories: [],
          }}
        />
      </StoreBaseProvider>,
    );
    const q = <T extends Element>(sel: string): T => {
      const el = view.container.querySelector<T>(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return el;
    };
    fireEvent.change(q<HTMLInputElement>('input[name="name"]'), { target: { value: "زبون تجريبي" } });
    fireEvent.change(q<HTMLInputElement>('input[name="phone"]'), { target: { value: "07802301677" } });
    fireEvent.change(q<HTMLSelectElement>('select[name="governorate"]'), { target: { value: "BG" } });
    fireEvent.change(q<HTMLInputElement>('input[name="city"]'), { target: { value: "الكرادة" } });
    fireEvent.change(q<HTMLTextAreaElement>('textarea[name="address"]'), { target: { value: "قرب الجسر" } });
    await act(async () => {
      fireEvent.submit(q<HTMLFormElement>("form"));
    });
    await waitFor(() =>
      expect(view.container.textContent).toContain("طلبك واصلنا، لا تطلبه مرة ثانية"),
    );
    const fbq = (globalThis as unknown as { fbq: ReturnType<typeof vi.fn> }).fbq;
    expect(fbq.mock.calls.some((c) => c[1] === "Purchase")).toBe(false);
    expect(useCart.getState().items).toHaveLength(1);
    expect(window.sessionStorage.getItem("schn:last-order")).toBeNull();
  });
});
