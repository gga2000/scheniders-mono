// @vitest-environment jsdom
// W5.1 — a returning shopper's details come back from THIS browser only:
// no server lookup by phone. The banner never renders on the server
// (hydration-safe) and "Not you?" forgets the record.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { readCustomerMemory, writeCustomerMemory } from "./helpers/customer-memory";
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
const TENANT = "33333333-3333-4333-8333-333333333333";
const tenant = { id: TENANT, business_name: "متجر", store_config: { contact: { whatsapp_number: "07701234567" } } };
const product: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "عطر تجريبي",
  price: 25000,
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
};

function element(props: Partial<typeof pdp_direct_order.defaultProps> = {}) {
  return React.createElement(
    StoreBaseProvider,
    { base: "", children: null },
    React.createElement(pdp_direct_order.render, {
      props: { ...pdp_direct_order.defaultProps, ...props },
      ctx: { tenant: tenant as never, runtime, products: [], categories: [], product },
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("pdp_direct_order remembers the shopper (W5.1)", () => {
  it("prefills blank fields from this browser's record and shows the banner", () => {
    writeCustomerMemory(TENANT, {
      customer_name: "زبون-تجريبي-٩٩",
      phone: "07701234567",
      governorate_code: "BG",
      address_details: "الكرادة",
    });
    render(element());
    expect(screen.getByTestId("welcome-back")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /الاسم/ }) as HTMLInputElement).value).toBe("زبون-تجريبي-٩٩");
    expect((document.querySelector('input[name="phone"]') as HTMLInputElement).value).toBe("07701234567");
    expect((document.querySelector('select[name="governorate"]') as HTMLSelectElement).value).toBe("BG");
    expect((document.querySelector('[name="address"]') as HTMLTextAreaElement).value).toBe("الكرادة");
  });

  it("renders nothing of it on the server, so the HTML matches the first client paint", () => {
    writeCustomerMemory(TENANT, { customer_name: "زبون-تجريبي-٩٩", phone: "07701234567", governorate_code: "BG", address_details: "x" });
    const html = renderToStaticMarkup(element());
    expect(html).not.toContain('data-testid="welcome-back"');
    expect(html).not.toContain("زبون-تجريبي-٩٩");
  });

  it("\"Not you?\" clears the record and the fields", () => {
    writeCustomerMemory(TENANT, { customer_name: "زبون-تجريبي-٩٩", phone: "07701234567", governorate_code: "BG", address_details: "x" });
    render(element());
    fireEvent.click(screen.getByRole("button", { name: /مو انت/ }));
    expect(readCustomerMemory(TENANT)).toBeNull();
    expect(screen.queryByTestId("welcome-back")).toBeNull();
    expect((document.querySelector('input[name="phone"]') as HTMLInputElement).value).toBe("");
  });

  it("shows no banner and calls nothing when there is no record — a stranger is a stranger", () => {
    render(element());
    expect(screen.queryByTestId("welcome-back")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("pdp_direct_order abandoned-cart beacon (W5.4)", () => {
  it("does not beacon a remembered phone until the shopper touches the form", () => {
    vi.useFakeTimers();
    writeCustomerMemory(TENANT, { customer_name: "زبون-تجريبي-٩٩", phone: "07701234567", governorate_code: "BG", address_details: "x" });
    render(element({ show_capture_consent: true }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.focus(document.querySelector('input[name="phone"]') as HTMLInputElement);
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/cart/abandoned");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("tenant_id");
    expect(body.phone).toBe("07701234567");
    expect(body.governorate).toBe("BG");
    expect(body.consent_text).toBe("ممكن نراسلك واتساب بخصوص طلبك");
    expect(body.items).toEqual([{ product_id: product.id, variant_id: null, quantity: 1 }]);
  });

  it("beacons nothing for a store that does not show the consent line", () => {
    vi.useFakeTimers();
    writeCustomerMemory(TENANT, { customer_name: "زبون-تجريبي-٩٩", phone: "07701234567", governorate_code: "BG", address_details: "x" });
    render(element());
    fireEvent.focus(document.querySelector('input[name="phone"]') as HTMLInputElement);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
