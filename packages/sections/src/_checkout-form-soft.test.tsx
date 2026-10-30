// @vitest-environment jsdom
// checkout_form `submit_label_i18n` + `style: "soft"` (slice 1h): the
// order action named as on the product page («ثبّت طلبي»), the express
// form's voice (no step chips, quiet card, express fields, the soft
// yellow submit with the total under its label, WhatsApp as the soft
// green row, no fine print), and a request body that is exactly today's.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import checkout_form, { type Props } from "./checkout_form";
import { COPY_ACTIONS } from "./_copy-terms";
import { IRAQ_CART, IRAQ_DRAFT_CHECKOUT_FORM_BASE, LONG_TITLE_LINE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";

const NAMED: Props = { ...IRAQ_DRAFT_CHECKOUT_FORM_BASE, submit_label_i18n: { ar: "ثبّت طلبي", en: "Place my order" } };
const SOFT: Props = { ...NAMED, style: "soft" };

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  withCart([]);
});

function mount(props: Props, locale: "ar" | "en" = "ar") {
  const Form = checkout_form.render;
  const view = mountInStore(<Form props={props} ctx={pageCtx("checkout", locale)} />);
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return { container: view.container, q };
}

function fill(q: ReturnType<typeof mount>["q"]): void {
  fireEvent.change(q<HTMLInputElement>('input[name="name"]'), { target: { value: "زبون تجريبي" } });
  fireEvent.change(q<HTMLInputElement>('input[name="phone"]'), { target: { value: "07802301677" } });
  fireEvent.change(q<HTMLSelectElement>('select[name="governorate"]'), { target: { value: "BG" } });
  fireEvent.change(q<HTMLInputElement>('input[name="city"]'), { target: { value: "الكرادة" } });
  fireEvent.change(q<HTMLTextAreaElement>('textarea[name="address"]'), { target: { value: "قرب الجسر" } });
}

describe("checkout_form props", () => {
  it("parse; bad stored values degrade to absent, never drop the form", () => {
    expect(checkout_form.schema.parse(SOFT)).toEqual(SOFT);
    const bad = checkout_form.schema.parse({ ...SOFT, style: "x", submit_label_i18n: 5 });
    expect([bad.style, bad.submit_label_i18n, bad.payment_methods]).toEqual([undefined, undefined, ["cod"]]);
  });

  it("chunky renders exactly like absent", () => {
    withCart(IRAQ_CART);
    const absent = html(mount(IRAQ_DRAFT_CHECKOUT_FORM_BASE).container);
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_CHECKOUT_FORM_BASE, style: "chunky" }).container)).toBe(absent);
  });

  it("submit_label_i18n names the chunky submit too", () => {
    withCart(IRAQ_CART);
    const { q } = mount(NAMED);
    expect(q('button[type="submit"]').textContent).toBe("ثبّت طلبي — 128,500 د.عarrow_forward");
  });
});

describe("checkout_form soft", () => {
  it("one yellow fill: «ثبّت طلبي» with the total under it; no step chips, no fine print", () => {
    withCart(IRAQ_CART);
    const { container, q } = mount(SOFT);
    expectSoftRules(container.innerHTML, 1);
    expect(q('button[type="submit"]').textContent).toBe("ثبّت طلبي128,500 د.عarrow_back");
    expect(q('button[type="submit"]').className).toContain("shadow-bk-button");
    expect(container.querySelector("ol")).toBeNull();
    expect(container.textContent).not.toContain("أكّد الطلب");
    expect(container.textContent).not.toContain("بتأكيدك الطلب");
    expect(q("h1").className).toContain("text-bk-chapter");
  });

  it("COD only, 18 governorates, the express fields reading from the right", () => {
    withCart(IRAQ_CART);
    const { container, q } = mount(SOFT);
    expect(container.querySelectorAll('select[name="governorate"] option:not([disabled])')).toHaveLength(18);
    expect(container.textContent).toContain("الدفع عند الاستلام");
    expect(q('input[name="name"]').className).toContain("text-right");
    expect(q('input[name="name"]').className).toContain("rounded-bk-input");
  });

  it("WhatsApp is the soft green row, named as the express tile", () => {
    withCart(IRAQ_CART);
    const { q } = mount(SOFT);
    expect(q("[data-soft-whatsapp]").textContent).toBe(COPY_ACTIONS.orderOnWhatsapp);
  });

  it("the request body is exactly today's: soft and the label change nothing the server reads", async () => {
    async function bodyOf(props: Props): Promise<Record<string, unknown>> {
      withCart(IRAQ_CART);
      const fetchFn = vi.fn((_url: string, _init?: RequestInit) =>
        Promise.resolve(new Response(JSON.stringify({ success: true, duplicate: true }), { status: 200 })),
      );
      vi.stubGlobal("fetch", fetchFn);
      const { q } = mount(props);
      fill(q);
      await act(async () => {
        fireEvent.submit(q<HTMLFormElement>("form"));
      });
      const call = fetchFn.mock.calls.find(([url]) => url === "/api/checkout/orders");
      const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
      cleanup();
      // The two per-submission random ids are minted fresh each time.
      return { ...body, idempotency_key: "k", event_id: "e" };
    }
    const today = await bodyOf(IRAQ_DRAFT_CHECKOUT_FORM_BASE);
    expect(await bodyOf(SOFT)).toEqual(today);
    expect(Object.keys(today).sort()).toEqual([
      "ab_test_arms",
      "address_details",
      "city",
      "customer_name",
      "event_id",
      "governorate_code",
      "idempotency_key",
      "items",
      "locale",
      "notes",
      "payment_method",
      "phone",
      "subtotal",
      "tenant_id",
    ]);
  });

  it("a reprice names the button the shopper taps again", async () => {
    withCart(IRAQ_CART);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: "issues",
              issues: [{ product_id: LONG_TITLE_LINE.product_id, variant_id: null, reason: "price_changed", new_price: 38000 }],
            }),
            { status: 409 },
          ),
        ),
      ),
    );
    const { container, q } = mount(SOFT);
    fill(q);
    await act(async () => {
      fireEvent.submit(q<HTMLFormElement>("form"));
    });
    await waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "تحدّثت سلتك. راجعها واضغط «ثبّت طلبي» مرة ثانية.",
      ),
    );
  });

  it("without a merchant label the reprice line is today's", async () => {
    withCart(IRAQ_CART);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ issues: [{ product_id: LONG_TITLE_LINE.product_id, variant_id: null, reason: "unavailable" }] }),
            { status: 409 },
          ),
        ),
      ),
    );
    const { container, q } = mount(IRAQ_DRAFT_CHECKOUT_FORM_BASE);
    fill(q);
    await act(async () => {
      fireEvent.submit(q<HTMLFormElement>("form"));
    });
    await waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "تم تحديث سلتك. راجعها ثم أكّد الطلب مرة أخرى.",
      ),
    );
  });
});
