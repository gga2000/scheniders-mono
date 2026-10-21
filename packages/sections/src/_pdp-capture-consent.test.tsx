// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order: half-filled phone capture, only with consent
// =====================================================================
// A phone typed on the product page is kept as a lead only where the
// merchant shows the consent line under the phone field (opt-in). Without
// the opt-in there is no line and no beacon, and the markup is unchanged.
// The beacon sends the line exactly as shown and never a tenant id, a
// price or a name: the server derives all of those. Nothing is beaconed
// while the order is being placed.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order, { type Props } from "./pdp_direct_order";
import { EXPRESS_IRAQ_PDP_PROPS, plainProduct, productCtx, productRuntime } from "./_pdp-fixtures";

const DEFAULT_AR = "ممكن نراسلك واتساب بخصوص طلبك";
const DEFAULT_EN = "We may message you on WhatsApp about your order";
const DEFAULT_KU = "لەوانەیە سەبارەت بە داواکارییەکەت لە واتسئاپ نامەت بۆ بنێرین";

function element(props: Partial<Props> = {}, locale: LocaleCode = "ar") {
  const Section = pdp_direct_order.render;
  return (
    <StoreBaseProvider base="">
      <Section
        props={{ ...pdp_direct_order.defaultProps, ...props }}
        ctx={productCtx(plainProduct, { runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>
  );
}

const fetchMock = vi.fn((url: string) =>
  url === "/api/checkout/orders"
    ? new Promise<Response>(() => undefined)
    : Promise.resolve(new Response("{}")),
);
const beacons = () => fetchMock.mock.calls.filter(([url]) => url === "/api/cart/abandoned");

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}
function typePhone(value = "07701234567"): void {
  const phone = q<HTMLInputElement>('input[name="phone"]');
  fireEvent.focus(phone);
  fireEvent.change(phone, { target: { value } });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("schema", () => {
  it("degrades a malformed opt-in instead of dropping the buy box", () => {
    const parsed = pdp_direct_order.schema.parse({
      ...pdp_direct_order.defaultProps,
      show_capture_consent: "yes",
      capture_consent_i18n: 7,
    });
    expect(parsed.show_capture_consent).toBeUndefined();
    expect(parsed.capture_consent_i18n).toBeUndefined();
  });
});

describe("without the opt-in", () => {
  it("renders no consent line and beacons nothing", () => {
    expect(renderToStaticMarkup(element())).not.toContain("data-capture-consent");
    render(element());
    typePhone();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(beacons()).toHaveLength(0);
  });
});

describe("with the opt-in (classic)", () => {
  it("shows the default line under the phone field in ar / en / ku", () => {
    for (const [locale, text] of [
      ["ar", DEFAULT_AR],
      ["en", DEFAULT_EN],
      ["ku", DEFAULT_KU],
    ] as const) {
      const html = renderToStaticMarkup(element({ show_capture_consent: true }, locale));
      expect(html).toContain("data-capture-consent");
      expect(html).toContain(text);
    }
  });

  it("shows the merchant's own wording when set", () => {
    const html = renderToStaticMarkup(
      element({ show_capture_consent: true, capture_consent_i18n: { ar: "نراسلك بخصوص طلبك فقط" } }),
    );
    expect(html).toContain("نراسلك بخصوص طلبك فقط");
    expect(html).not.toContain(DEFAULT_AR);
  });

  it("beacons the phone with the line as shown, and no tenant id, name or price", () => {
    render(element({ show_capture_consent: true }));
    expect(q("[data-capture-consent]").textContent).toBe(DEFAULT_AR);
    typePhone();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(beacons()).toHaveLength(1);
    const [, init] = beacons()[0] as unknown as [string, RequestInit];
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({
      phone: "07701234567",
      items: [{ product_id: plainProduct.id, variant_id: null, quantity: 1 }],
      locale: "ar",
      consent_text: DEFAULT_AR,
    });
  });

  it("beacons nothing once the order is being placed", () => {
    render(element({ show_capture_consent: true }));
    typePhone();
    fireEvent.change(q<HTMLInputElement>('input[name="name"]'), { target: { value: "علي" } });
    fireEvent.change(q<HTMLSelectElement>('select[name="governorate"]'), { target: { value: "BG" } });
    fireEvent.change(q<HTMLTextAreaElement>('[name="address"]'), { target: { value: "الكرادة" } });
    act(() => {
      fireEvent.submit(q<HTMLFormElement>("form"));
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/checkout/orders")).toHaveLength(1);
    expect(beacons()).toHaveLength(0);
  });
});
