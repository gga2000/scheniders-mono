// @vitest-environment jsdom
// =====================================================================
// The Espresso Dock (slice 1i) — `cta_layout: "dock"`
// =====================================================================
// Ali's concept A «الكبسولة»: one espresso capsule holding the yellow
// «ثبّت طلبي» pill, the cream «أضف للسلة» segment and the WhatsApp
// segment; an add slides a confirmation drawer out from under it. The dock
// changes the look only: the same submit (the only thing that sends the
// order, D6), the same cart tap (1g), the same WhatsApp link, the same
// live region, and the 1f sticky bar still hands off to the submit.
// Absent or "row", the express section is exactly today's (frozen in
// _pdp-express-row-baseline-snapshot).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { LocaleCode } from "@scheniders/shared";
import { useCart } from "./helpers/cart-store";
import { EXPRESS_SUBMIT_ID, useExpressOrderStore } from "./helpers/express-order-store";
import { orderDraftKey, writeOrderDraft } from "./helpers/order-draft";
import { StoreBaseProvider } from "./helpers/store-context";
import { useVariantStore } from "./helpers/variant-store";
import pdp_direct_order, { type Props } from "./pdp_direct_order";
import sticky_cta_bar, { type Props as StickyProps } from "./sticky_cta_bar";
import type { Product } from "./types";
import {
  EXPRESS_IRAQ_PDP_PROPS,
  IRAQ_DRAFT_STICKY_PROPS,
  fixtureTenant,
  plainProduct,
  productCtx,
  soldOutProduct,
  variantProduct,
} from "./_pdp-fixtures";

const CART: Props = { ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: true };

function markup(props: Props, product: Product = plainProduct, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render
        props={props}
        ctx={productCtx(product, { runtime: { ...productCtx(product).runtime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

beforeEach(() => {
  useCart.setState({ items: [] });
  useVariantStore.setState({ selected: {} });
  useExpressOrderStore.setState({ forms: {}, watchers: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("cta_layout prop", () => {
  it("parses row and dock; a bad stored value degrades to absent", () => {
    expect(pdp_direct_order.schema.parse({ ...CART, cta_layout: "dock" }).cta_layout).toBe("dock");
    expect(pdp_direct_order.schema.parse({ ...CART, cta_layout: "row" }).cta_layout).toBe("row");
    const bad = pdp_direct_order.schema.parse({ ...CART, cta_layout: "capsule" });
    expect(bad.cta_layout).toBeUndefined();
    expect(bad.layout).toBe("express");
  });

  it("row renders exactly like absent, with and without the cart", () => {
    expect(markup({ ...CART, cta_layout: "row" })).toBe(markup(CART));
    expect(markup({ ...EXPRESS_IRAQ_PDP_PROPS, cta_layout: "row" })).toBe(markup(EXPRESS_IRAQ_PDP_PROPS));
  });

  it("a jsdom mount of the default row has no dock", () => {
    const view = render(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render props={CART} ctx={productCtx(plainProduct)} />
      </StoreBaseProvider>,
    );
    expect(view.container.querySelector("[data-cta-layout]")).toBeNull();
  });
});

const DOCK: Props = { ...CART, cta_layout: "dock" };

/** The whole element whose opening tag carries `marker`, by tag balance. */
function elementHtml(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const name = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
  let depth = 0;
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, "g");
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

const row = (html: string) => elementHtml(html, 'data-layer="submit"');
const dockStyle = (html: string) => elementHtml(html, 'data-href="bk-pdp-express-dock"');
/** The express motion sheet every express page carries. */
const motionStyle = (html: string) => elementHtml(html, 'data-href="bk-pdp-express-motion"');
/** The opening tag of the element carrying `marker`. */
const openTag = (html: string, marker: string) => {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
};

describe("the dock's server markup", () => {
  const html = markup(DOCK);
  const dock = row(html);

  it("one capsule: WhatsApp, then the cart segment, then the submit, then the drawer", () => {
    expect(openTag(dock, 'data-layer="submit"')).toContain('data-cta-layout="dock"');
    const order = ['aria-label="اطلب عبر واتساب"', "data-cart-add", 'type="submit"', "data-cart-drawer"].map((k) =>
      dock.indexOf(k),
    );
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("only the yellow pill is a submit; the cart segment is a plain button", () => {
    const form = elementHtml(html, 'id="direct-order"');
    expect(form.split('type="submit"').length - 1).toBe(1);
    expect(openTag(dock, "data-cart-add")).toContain('type="button"');
    expect(openTag(dock, 'type="submit"')).toContain("bk-xp-dock-order");
  });

  it("the WhatsApp segment opens the same chat as today's tile", () => {
    const tile = (h: string) => openTag(row(h), 'aria-label="اطلب عبر واتساب"');
    const href = (tag: string) => /href="([^"]*)"/.exec(tag)?.[1];
    expect(href(tile(html))).toBe(href(tile(markup(CART))));
    expect(href(tile(html))).toMatch(/^https:\/\/wa\.me\//);
    expect(tile(html)).toContain('target="_blank"');
    expect(tile(html)).toContain('rel="noopener noreferrer"');
    const wa = elementHtml(dock, 'aria-label="اطلب عبر واتساب"');
    expect(wa).toContain(">واتساب<");
    expect(wa).toContain('d="M17.472 14.382');
  });

  it("the submit keeps its label, its shine and its arrow; no id until a sticky bar watches", () => {
    const submit = elementHtml(dock, 'type="submit"');
    expect(submit).toContain(">ثبّت طلبي<");
    expect(submit).toMatch(/class="bk-xp-sheen [^"]* bk-xp-sheen-rtl"/);
    expect(submit).toContain("bk-xp-nudge-rtl");
    expect(submit).toContain("bk-xp-dock-disc");
    expect(openTag(dock, 'type="submit"')).not.toContain(" id=");
  });

  it("solid yellow only on the submit; labels at 12px or more", () => {
    expect(dock.match(/\bbg-bk-primary(?![-\w/])/g)).toHaveLength(1);
    expect(dock).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/);
    expect(elementHtml(dock, "data-cart-add")).toContain(">أضف للسلة<");
    expect(elementHtml(dock, "data-cart-add")).toContain("text-xs");
  });

  it("no dir attribute and no colour literal, in the row or its stylesheet", () => {
    expect(dock).not.toContain(" dir=");
    expect(html.split(" dir=").length).toBe(markup(CART).split(" dir=").length);
    const css = dockStyle(html);
    for (const part of [dock, css]) expect(part).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(css).toContain("cubic-bezier(.22,1,.36,1)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("the stylesheet ships only with the dock, beside an unchanged motion sheet", () => {
    expect(openTag(html, 'data-href="bk-pdp-express-dock"')).toContain('data-precedence="bk-sections-dock"');
    expect(motionStyle(html)).toBe(motionStyle(markup(CART)));
    expect(markup(CART)).not.toContain("bk-pdp-express-dock");
    expect(markup(EXPRESS_IRAQ_PDP_PROPS)).not.toContain("bk-xp-dock");
  });

  it("the drawer's live region is in the row from the start, empty and closed", () => {
    const drawer = openTag(dock, "data-cart-drawer");
    expect(drawer).not.toContain("data-open");
    expect(dock).toMatch(/<p role="status" data-cart-status="" class="[^"]*"><\/p>/);
  });

  it("without add_to_cart: WhatsApp and the submit only", () => {
    const plain = row(markup({ ...EXPRESS_IRAQ_PDP_PROPS, cta_layout: "dock" }));
    expect(plain).toContain('data-cta-layout="dock"');
    expect(plain).not.toContain("data-cart-add");
    expect(plain).not.toContain("data-cart-drawer");
    expect(plain).toContain('aria-label="اطلب عبر واتساب"');
  });

  it("without WhatsApp: the cart segment and the submit only", () => {
    const noWa = row(markup({ ...DOCK, show_whatsapp: false }));
    expect(noWa).not.toContain("wa.me");
    expect(noWa).toContain("data-cart-add");
  });

  it("sold out: no cart segment, no drawer, the disabled submit says so with no disc", () => {
    const oos = row(markup(DOCK, soldOutProduct));
    expect(oos).not.toContain("data-cart-add");
    expect(oos).not.toContain("data-cart-drawer");
    const submit = elementHtml(oos, 'type="submit"');
    expect(openTag(oos, 'type="submit"')).toContain('disabled=""');
    expect(submit).toContain(">نفد المخزون<");
    expect(submit).not.toContain("bk-xp-dock-disc");
  });

  it("english: Add to cart, WhatsApp, and the arrow points right", () => {
    const en = row(markup(DOCK, plainProduct, "en"));
    expect(en).toContain(">Add to cart<");
    expect(en).toContain(">WhatsApp<");
    expect(en).toMatch(/bk-xp-nudge(?!-rtl)/);
    expect(en).not.toContain("bk-xp-dock-rtl");
    expect(en).toContain('d="M5 12h13.5M13 6l6 6-6 6"');
  });

  it("kurdish: the cart label in Kurdish, read from the right", () => {
    const ku = row(markup(DOCK, plainProduct, "ku"));
    expect(ku).toContain(">خستنە سەبەتە<");
    expect(ku).toContain("bk-xp-dock-rtl");
  });
});

// ── In a browser DOM ──────────────────────────────────────────────────

const STICKY: StickyProps = {
  ...IRAQ_DRAFT_STICKY_PROPS,
  primary_kind: "form_aware",
  style: "soft",
  secondary_display: "icon",
};

/** The sticky bar watches the form through an IntersectionObserver; here
 *  the form is reported off screen, so the bar is on screen. */
class OffScreen {
  constructor(private readonly cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.cb([{ isIntersecting: false }]);
  }
  disconnect() {}
}

const scrolled: Element[] = [];
/** Every request answers `{}`, except the order itself, which never does
 *  (the order stays "being placed"). */
const pendingOrder = (url: string) =>
  url === "/api/checkout/orders" ? new Promise<Response>(() => {}) : Promise.resolve(new Response("{}"));
const fetchMock = vi.fn(pendingOrder);

function mount(product: Product = plainProduct, props: Props = DOCK, withSticky = false) {
  const ctx = productCtx(product);
  const Pdp = pdp_direct_order.render;
  const Bar = sticky_cta_bar.render;
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Pdp props={props} ctx={ctx} />
      {withSticky && <Bar props={STICKY} ctx={ctx} />}
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  const form = q<HTMLFormElement>("form#direct-order");
  const submits: Event[] = [];
  form.addEventListener("submit", (e) => submits.push(e));
  return {
    view,
    q,
    form,
    submits,
    pill: () => q<HTMLButtonElement>('[data-cta-layout="dock"] button[type="submit"]'),
    cartSeg: () => q<HTMLButtonElement>("[data-cart-add]"),
    wa: () => q<HTMLAnchorElement>('[data-cta-layout="dock"] a[aria-label="اطلب عبر واتساب"]'),
    drawer: () => q<HTMLElement>("[data-cart-drawer]"),
    status: () => q<HTMLElement>("[data-cart-status]"),
    badge: () => view.container.querySelector<HTMLElement>("[data-dock-count]"),
  };
}

function fillAll(q: ReturnType<typeof mount>["q"]) {
  fireEvent.change(q('input[name="phone"]'), { target: { value: "0770 123 4567" } });
  fireEvent.change(q('input[name="name"]'), { target: { value: "علي" } });
  fireEvent.change(q('select[name="governorate"]'), { target: { value: "BG" } });
  fireEvent.change(q('input[name="address"]'), { target: { value: "المنصور" } });
}

const ordersCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/checkout/orders");

/** jsdom does not navigate; a link tap is only a click event here. */
function stopNavigation(e: MouseEvent) {
  if (e.target instanceof Element && e.target.closest("a")) e.preventDefault();
}

describe("the dock in a browser DOM", () => {
  beforeEach(() => {
    scrolled.length = 0;
    fetchMock.mockReset();
    fetchMock.mockImplementation(pendingOrder);
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", OffScreen);
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    document.addEventListener("click", stopNavigation);
  });
  afterEach(() => {
    document.removeEventListener("click", stopNavigation);
  });

  it("the cart segment and the WhatsApp link never submit; the yellow pill does, once", () => {
    const { cartSeg, wa, pill, submits } = mount();
    fireEvent.click(cartSeg());
    expect(useCart.getState().items.map((i) => [i.product_id, i.quantity])).toEqual([[plainProduct.id, 1]]);
    fireEvent.click(wa());
    expect(submits).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(pill());
    expect(submits).toHaveLength(1);
    // An empty form only shows its field errors: no order is sent.
    expect(ordersCalls()).toHaveLength(0);
  });

  it("an add opens the drawer and the live region says it; every tap is announced again", () => {
    const { cartSeg, drawer, status, badge } = mount();
    expect(drawer().hasAttribute("data-open")).toBe(false);
    expect(status().textContent).toBe("");
    expect(badge()).toBeNull();
    fireEvent.click(cartSeg());
    expect(drawer().hasAttribute("data-open")).toBe(true);
    expect(status().textContent).toBe("انضافت للسلة · 1 بالسلةشوف السلة");
    expect(status().querySelector("a")?.getAttribute("href")).toBe("/s/fixture-store/cart");
    expect(badge()?.textContent).toBe("1");
    expect(badge()?.closest('[aria-hidden="true"]')).not.toBeNull();
    const first = status().firstElementChild;
    fireEvent.click(cartSeg());
    expect(status().firstElementChild).not.toBe(first);
    expect(status().textContent).toBe("انضافت للسلة · 2 بالسلةشوف السلة");
    expect(badge()?.textContent).toBe("2");
  });

  it("with the most that can be ordered already in the cart, nothing is added and the drawer says so", () => {
    const LOW: Product = { ...plainProduct, stock_quantity: 1 };
    const { cartSeg, status } = mount(LOW);
    fireEvent.click(cartSeg());
    fireEvent.click(cartSeg());
    expect(useCart.getState().items.map((i) => i.quantity)).toEqual([1]);
    expect(status().textContent).toBe("infoبسلتك أقصى كمية تكدر تطلبهاشوف السلة");
  });

  it("while a variant is owed the segment adds nothing and asks for the option", () => {
    const { cartSeg, view, q } = mount(variantProduct);
    fireEvent.click(cartSeg());
    expect(useCart.getState().items).toEqual([]);
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe("اختار الخيار أول.");
    expect(document.activeElement).toBe(q('[data-layer="variants"] button'));
  });

  it("the form-aware sticky bar still hands off to the yellow pill (1f)", () => {
    const { q, pill } = mount(plainProduct, DOCK, true);
    fillAll(q);
    const primary = q<HTMLButtonElement>("[data-sticky-primary]");
    expect(primary.dataset.stickyPrimary).toBe("complete");
    fetchMock.mockClear();
    fireEvent.click(primary);
    expect(document.activeElement).toBe(pill());
    expect(pill().id).toBe(EXPRESS_SUBMIT_ID);
    expect(scrolled.map((e) => e.hasAttribute("data-receipt"))).toEqual([true]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("while the order is being placed: the pill is busy with a spinner, the cart segment waits", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { q, form, pill, cartSeg } = mount();
    fillAll(q);
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(pill().getAttribute("aria-busy")).toBe("true"));
    expect(pill().disabled).toBe(true);
    expect(pill().textContent).toContain("جارٍ تأكيد الطلب…");
    expect(pill().textContent).toContain("progress_activity");
    expect(cartSeg().disabled).toBe(true);
    expect(ordersCalls()).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it("a placed direct order still retires the product's cart lines (1g)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    writeOrderDraft(fixtureTenant.id, plainProduct.id, {
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
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url === "/api/checkout/orders"
              ? { success: true, orderNumber: "SH-0001", orderId: "order-1", total: 18000 }
              : {},
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { cartSeg, form } = mount();
    fireEvent.click(cartSeg());
    expect(useCart.getState().items).toHaveLength(1);
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() =>
      expect(window.sessionStorage.getItem(orderDraftKey(fixtureTenant.id, plainProduct.id))).toBeNull(),
    );
    expect(ordersCalls()).toHaveLength(1);
    expect(useCart.getState().items).toEqual([]);
    vi.restoreAllMocks();
  });
});
