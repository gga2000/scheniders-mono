// @vitest-environment jsdom
// order_confirmation `style: "soft"` (slice 1h): the recap as the express
// receipt — the product named as its page names it (the express stash's
// `display_name`), the total in ink — chapter headings, ink step numbers,
// WhatsApp as the soft green row, a quiet track link. The express order
// writes `display_name` into the stash; its request body is unchanged.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { writeOrderDraft } from "./helpers/order-draft";
import order_confirmation, { type Props } from "./order_confirmation";
import pdp_direct_order from "./pdp_direct_order";
import { EXPRESS_STASH, IRAQ_DRAFT_CONFIRMATION_BASE, LONG_TITLE_LINE, pageCtx } from "./_cart-checkout-fixtures";
import { html, mountInStore } from "./_cart-checkout-test-utils";
import { EXPRESS_IRAQ_PDP_PROPS, FIXTURE_NOW, fixtureTenant, plainProduct, productCtx } from "./_pdp-fixtures";

const SOFT: Props = { ...IRAQ_DRAFT_CONFIRMATION_BASE, style: "soft" };
const NAMED_STASH = { ...EXPRESS_STASH, items: [{ ...EXPRESS_STASH.items[0], display_name: "ويفر انتنس" }] };

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(props: Props, stash: object) {
  vi.useFakeTimers({ toFake: ["Date"], now: FIXTURE_NOW });
  window.sessionStorage.setItem("schn:last-order", JSON.stringify(stash));
  const Confirmation = order_confirmation.render;
  return mountInStore(
    <Confirmation props={props} ctx={pageCtx("checkout_success", "ar", undefined, "SH-0001")} />,
  ).container;
}

describe("order_confirmation style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(order_confirmation.schema.parse(SOFT).style).toBe("soft");
    expect(order_confirmation.schema.parse({ ...SOFT, style: "x" }).style).toBeUndefined();
  });

  it("chunky renders exactly like absent, even with a display name in the stash", () => {
    const absent = html(mount(IRAQ_DRAFT_CONFIRMATION_BASE, NAMED_STASH));
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_CONFIRMATION_BASE, style: "chunky" }, NAMED_STASH))).toBe(absent);
    expect(absent).toContain(LONG_TITLE_LINE.name);
  });
});

describe("order_confirmation soft", () => {
  it("the recap names the product as its page does, total in ink", () => {
    const recap = mount(SOFT, NAMED_STASH).querySelector("[data-recap-style]");
    expect(recap?.textContent).toBe("ملخّص طلبكويفر انتنس× 136,750 د.عالمجموع36,750 د.ع");
    expect(recap?.innerHTML).not.toContain("--bk-primary");
    expect(recap?.querySelector("h2")?.className).toContain("text-bk-chapter");
  });

  it("a stash without display names (a cart order, an older stash) shows the line's own name", () => {
    const recap = mount(SOFT, EXPRESS_STASH).querySelector("[data-recap-style]");
    expect(recap?.textContent).toContain(LONG_TITLE_LINE.name);
  });

  it("ink step numbers, the ETA card, WhatsApp soft, a quiet track link; no yellow, no dir", () => {
    const view = mount(SOFT, NAMED_STASH);
    const steps = view.querySelector("[data-steps-style]");
    expect(steps?.querySelectorAll(".bg-bk-ink")).toHaveLength(3);
    expect(steps?.innerHTML).not.toContain("--bk-primary");
    expect(view.querySelector("[data-soft-whatsapp]")?.textContent).toBe("تواصل معنا عبر واتساب");
    const track = view.querySelector<HTMLAnchorElement>('a[href="/s/fixture-store/track?order=SH-0001"]');
    expect(track?.className).toContain("rounded-bk-input");
    expect(track?.getAttribute("style")).toBeNull();
    const below = [...view.querySelectorAll("[data-recap-style], [data-steps-style]")].map((n) => n.outerHTML).join("");
    expect(below).not.toContain(' dir="');
  });
});

describe("the express order stashes the page's name for the thank-you", () => {
  it("display_name beside the catalogue name; the request body keeps the catalogue name", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const product = { ...plainProduct, display_name: "تجريبي" };
    writeOrderDraft(fixtureTenant.id, product.id, {
      form: {
        customer_name: "زبون تجريبي",
        phone: "07802301677",
        alt_phone: "",
        governorate_code: "BG",
        address_details: "الكرادة قرب الجسر",
      },
      idempotencyKey: null,
      purchaseEventId: null,
    });
    const fetchFn = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, orderNumber: "SH-0002", orderId: "order-2", total: 18000 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchFn);
    const Pdp = pdp_direct_order.render;
    const view = mountInStore(<Pdp props={EXPRESS_IRAQ_PDP_PROPS} ctx={productCtx(product)} />);
    const form = view.container.querySelector<HTMLFormElement>("form#direct-order");
    if (!form) throw new Error("missing the order form");
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(window.sessionStorage.getItem("schn:last-order")).not.toBeNull());
    const saved = JSON.parse(window.sessionStorage.getItem("schn:last-order") ?? "{}") as {
      items: Array<{ name: string; display_name?: string }>;
    };
    expect(saved.items[0]).toMatchObject({ name: plainProduct.name, display_name: "تجريبي" });
    const call = fetchFn.mock.calls.find(([url]) => url === "/api/checkout/orders");
    const body = JSON.parse(String(call?.[1]?.body)) as { items: Array<Record<string, unknown>> };
    expect(body.items[0]?.name).toBe(plainProduct.name);
    expect(body.items[0]).not.toHaveProperty("display_name");
  });
});
