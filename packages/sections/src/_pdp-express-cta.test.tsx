// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order express — the order buttons and the scroll hint
// =====================================================================
// The submit carries the action only (no amount), with a nudging arrow
// and a light sweep that only exist while it can be pressed; the WhatsApp
// tile is a labelled secondary tile whose message carries the landmark the
// order posts; the quantity/payment tags are full 44px targets; the
// reassurance line flips its icon in Arabic; and the scroll hint shows
// once, a moment after load, until the first scroll — never over a form
// already on screen, mounted at the tenant root so no transformed section
// can trap it, and honouring the tenant's motion-off switch.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render as domRender } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import type { FormState } from "./pdp_direct_order.client";
import {
  EXPRESS_IRAQ_PDP_PROPS,
  SIGNATURE_PDP_PROPS,
  productCtx,
  productRuntime,
  saleProduct,
  soldOutProduct,
} from "./_pdp-fixtures";
import { SCROLL_HINT_DELAY_MS, ScrollHint } from "./pdp_express/scroll-hint";
import { addressWithLandmark, expressWhatsappHref } from "./pdp_express/whatsapp-href";

const Section = pdp_direct_order.render;

function render(
  props: Props,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(product, overrides)} />
    </StoreBaseProvider>,
  );
}

const en: Partial<SectionRenderContext> = { runtime: { ...productRuntime, locale: "en" } };

/** The submit <button …>…</button>. */
function submitHtml(html: string): string {
  const at = html.indexOf('type="submit"');
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<button", at);
  return html.slice(open, html.indexOf("</button>", at) + "</button>".length);
}

/** The WhatsApp tile <a …>…</a>. */
function waHtml(html: string): string {
  const at = html.indexOf('href="https://wa.me/');
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<a", at);
  return html.slice(open, html.indexOf("</a>", at) + "</a>".length);
}

describe("express submit", () => {
  it("never shows an amount on the button", () => {
    const btn = submitHtml(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct));
    expect(btn).not.toMatch(/\d{1,3}(,\d{3})+/);
    expect(btn).not.toContain("د.ع");
    expect(btn).not.toContain("<bdi");
    const english = submitHtml(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct, en));
    expect(english).not.toMatch(/\d{1,3}(,\d{3})+/);
    expect(english).not.toContain("IQD");
  });

  it("is at least 56px tall, with a pressed state and a token focus ring", () => {
    const btn = submitHtml(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct));
    expect(btn).toContain("min-h-[60px]");
    expect(btn).toContain("active:scale-[0.97]");
    expect(btn).toContain("active:bg-bk-primary-active");
    expect(btn).toContain("focus-visible:ring-bk-focus");
  });

  it("carries the sweep and an arrow pointing the reading direction", () => {
    const ar = submitHtml(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct));
    expect(ar).toContain("bk-xp-sheen");
    expect(ar).toContain("bk-xp-sheen-rtl");
    expect(ar).toContain("bk-xp-nudge-rtl");
    expect(ar).toContain(">arrow_back<");
    expect(ar).toContain("flex-row-reverse");
    expect(ar).not.toContain("dir=");

    const english = submitHtml(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct, en));
    expect(english).toContain(">arrow_forward<");
    expect(english).not.toContain("bk-xp-sheen-rtl");
    expect(english).not.toContain("flex-row-reverse");
  });

  it("is disabled with no motion when sold out", () => {
    const btn = submitHtml(render(EXPRESS_IRAQ_PDP_PROPS, soldOutProduct));
    expect(btn).toMatch(/<button[^>]*disabled=""/);
    expect(btn).toContain("نفد المخزون");
    expect(btn).not.toContain("bk-xp-sheen");
    expect(btn).not.toContain("arrow_back");
  });

  it("ships its keyframes once, guarded for reduced motion", () => {
    const html = render(EXPRESS_IRAQ_PDP_PROPS, saleProduct);
    expect(html.split('data-href="bk-pdp-express-motion"')).toHaveLength(2);
    expect(html).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(html).toContain("var(--bk-duration-reveal)");
  });

  it("the sweep can only lighten the button: a primary/surface mix screened over it", () => {
    const html = render(EXPRESS_IRAQ_PDP_PROPS, saleProduct);
    const at = html.indexOf(".bk-xp-sheen {");
    const rule = html.slice(at, html.indexOf("}", at));
    expect(rule).toContain("mix-blend-mode: screen");
    expect(rule).toContain("var(--bk-primary)");
    expect(rule).toContain("var(--bk-surface)");
    expect(rule).not.toContain("on-primary");
    // The blend only sees the button's own fill.
    expect(submitHtml(html)).toContain("isolate");
  });

  it("classic never gets the express motion", () => {
    expect(render(SIGNATURE_PDP_PROPS, saleProduct)).not.toContain("bk-pdp-express-motion");
  });
});

describe("express WhatsApp tile", () => {
  it("is a soft success-tinted tile with a visible label, secondary to the submit", () => {
    const a = waHtml(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct));
    expect(a).toContain("bg-bk-success/10");
    expect(a).toContain("active:scale-95");
    expect(a).toContain('aria-label="اطلب عبر واتساب"');
    expect(a).toContain(">واتساب</span>");
    expect(a).not.toContain("bg-bk-primary");
    expect(waHtml(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct, en))).toContain(">WhatsApp</span>");
  });

  it("is absent when the merchant turns WhatsApp off", () => {
    const html = render({ ...EXPRESS_IRAQ_PDP_PROPS, show_whatsapp: false }, saleProduct);
    expect(html).not.toContain("https://wa.me/");
  });
});

describe("express WhatsApp message", () => {
  const form: FormState = {
    customer_name: "علي",
    phone: "0780 123 4567",
    alt_phone: "",
    governorate_code: "BG",
    address_details: "المنصور شارع 14",
  };
  const base = {
    waHref: "https://wa.me/9647701234567?text=model",
    ctx: productCtx(saleProduct),
    product: saleProduct,
    qty: 2,
    form,
    total: 50000,
    locale: "ar" as const,
  };
  const text = (href: string | null) =>
    href ? decodeURIComponent(href.split("text=")[1] ?? "") : null;

  it("joins the landmark the way the order posts it", () => {
    expect(addressWithLandmark("المنصور", "")).toBe("المنصور");
    expect(addressWithLandmark("المنصور", "  ")).toBe("المنصور");
    expect(addressWithLandmark(" المنصور ", " قرب المصرف ")).toBe("المنصور - قرب المصرف");
    expect(addressWithLandmark("", "قرب المصرف")).toBe("قرب المصرف");
  });

  it("without a landmark it is the model's link, untouched", () => {
    expect(expressWhatsappHref(base, "")).toBe(base.waHref);
    expect(expressWhatsappHref(base, "   ")).toBe(base.waHref);
  });

  it("with a landmark the address line carries it", () => {
    const msg = text(expressWhatsappHref(base, "قرب مصرف الرافدين"));
    expect(msg).toContain("العنوان: المنصور شارع 14 - قرب مصرف الرافدين");
    expect(msg).toContain("المحافظة: بغداد");
    expect(msg).toContain("× 2");
    expect(msg).toContain("الاسم: علي");
  });

  it("stays off when the model has no link", () => {
    expect(expressWhatsappHref({ ...base, waHref: null }, "قرب")).toBeNull();
  });
});

describe("express quantity/payment tags and reassurance", () => {
  it("each tag button is a 44px target", () => {
    const html = render(EXPRESS_IRAQ_PDP_PROPS, saleProduct);
    const at = html.indexOf('data-layer="qty"');
    const block = html.slice(at, html.indexOf('data-layer="submit"'));
    const tags = block.match(/<button type="button"[^>]*aria-expanded[^>]*>/g) ?? [];
    expect(tags).toHaveLength(2);
    for (const t of tags) expect(t).toContain("h-11");
  });

  it("the reassurance line puts its icon on the reading side", () => {
    const tag = (html: string) => {
      const at = html.indexOf('data-i18n-field="reassurance_i18n"');
      return html.slice(html.lastIndexOf("<p", at), html.indexOf(">", at) + 1);
    };
    expect(tag(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct))).toContain("flex-row-reverse");
    expect(tag(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct, en))).not.toContain("flex-row-reverse");
  });
});

describe("express scroll hint — schema and server markup", () => {
  it("bad stored values are caught to undefined", () => {
    const parsed = pdp_direct_order.schema.safeParse({
      ...EXPRESS_IRAQ_PDP_PROPS,
      show_scroll_hint: "yes",
      scroll_hint_i18n: 42,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.show_scroll_hint).toBeUndefined();
      expect(parsed.data.scroll_hint_i18n).toBeUndefined();
    }
  });

  it("renders nothing on the server (it only exists once the client shows it)", () => {
    expect(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct)).not.toContain("data-scroll-hint");
  });

  it("classic ignores both fields", () => {
    expect(
      render(
        { ...SIGNATURE_PDP_PROPS, show_scroll_hint: true, scroll_hint_i18n: { ar: "انزل" } },
        saleProduct,
      ),
    ).toBe(render(SIGNATURE_PDP_PROPS, saleProduct));
  });
});

describe("express scroll hint — behaviour", () => {
  const jsdomInnerHeight = window.innerHeight;
  let reduced = false;
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    reduced = false;
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce") ? reduced : false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerHeight", { value: jsdomInnerHeight, configurable: true });
  });

  function mount(label = "انزل لتحت حتى تكمل طلبك") {
    const target = document.createElement("form");
    target.id = "direct-order";
    document.body.appendChild(target);
    return domRender(<ScrollHint label={label} targetId="direct-order" rtl />);
  }

  const hint = () => document.querySelector("[data-scroll-hint]");

  it("waits, then shows the merchant's line", () => {
    mount();
    expect(hint()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS - 1);
    });
    expect(hint()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(hint()?.textContent).toContain("انزل لتحت حتى تكمل طلبك");
    expect(hint()?.querySelector("button")?.className).toContain("flex-row-reverse");
  });

  it("leaves on the first scroll and never comes back", () => {
    mount();
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS);
    });
    expect(hint()).not.toBeNull();
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(hint()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS * 5);
    });
    expect(hint()).toBeNull();
  });

  it("never shows when the shopper scrolls before the delay", () => {
    mount();
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS * 2);
    });
    expect(hint()).toBeNull();
  });

  it("never shows when the page opens mid-way", () => {
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    mount();
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS * 2);
    });
    expect(hint()).toBeNull();
  });

  it("leaves when the shopper focuses a field", () => {
    mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS);
    });
    expect(hint()).not.toBeNull();
    act(() => {
      input.focus();
    });
    expect(hint()).toBeNull();
  });

  it("tapping glides to the order form (jumps under reduced motion)", () => {
    mount();
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS);
    });
    const btn = hint()?.querySelector("button");
    expect(btn).toBeTruthy();
    if (btn) {
      act(() => {
        fireEvent.click(btn);
      });
    }
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(hint()).toBeNull();

    cleanup();
    document.body.innerHTML = "";
    reduced = true;
    mount();
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS);
    });
    const again = hint()?.querySelector("button");
    if (again) {
      act(() => {
        fireEvent.click(again);
      });
    }
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "auto", block: "start" });
  });

  /** Lays the page out at 355x640: the pill band (a fixed bottom wrapper,
   *  pill 48px + 16px padding), the form's top and its first field. */
  function layout({ formTop, fieldTop }: { formTop: number; fieldTop: number }) {
    Object.defineProperty(window, "innerHeight", { value: 640, configurable: true });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect(
      this: Element,
    ) {
      if (this.hasAttribute("data-scroll-hint")) {
        return DOMRect.fromRect({ x: 0, y: 576, width: 355, height: 64 });
      }
      if (this.id === "direct-order") {
        return DOMRect.fromRect({ x: 0, y: formTop, width: 355, height: 600 });
      }
      if (this instanceof HTMLInputElement) {
        return DOMRect.fromRect({ x: 16, y: fieldTop, width: 323, height: 52 });
      }
      return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function h(
      this: HTMLElement,
    ) {
      return this.tagName === "BUTTON" ? 48 : 0;
    });
  }

  function mountWithField() {
    const target = document.createElement("form");
    target.id = "direct-order";
    target.appendChild(document.createElement("input"));
    document.body.appendChild(target);
    domRender(<ScrollHint label="x" targetId="direct-order" rtl />);
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS);
    });
  }

  it("stays away when the form's first field is already on screen", () => {
    // 390x844-like: the phone field is fully visible.
    layout({ formTop: 400, fieldTop: 470 });
    mountWithField();
    expect(hint()).toBeNull();
  });

  it("lifts above a form whose heading peeks but whose field is below the fold", () => {
    // /products/delight at 355x640: pill 576-624, form starts at 565, the
    // phone field below the fold.
    layout({ formTop: 565, fieldTop: 640 });
    mountWithField();
    const el = hint();
    expect(el).not.toBeNull();
    // The band (padding included) now ends at the form's top: 640 - 565.
    expect(el?.getAttribute("style")).toContain("bottom: 75px");
  });

  it("stays away when there is no room above the form to lift into", () => {
    layout({ formTop: 40, fieldTop: 700 });
    mountWithField();
    expect(hint()).toBeNull();
  });

  it("keeps its spot when the form starts below the pill", () => {
    layout({ formTop: 700, fieldTop: 760 });
    mountWithField();
    expect(hint()).not.toBeNull();
    expect(hint()?.getAttribute("style")).toBeNull();
  });

  it("mounts into the tenant root, out of a transformed section", () => {
    const root = document.createElement("div");
    root.setAttribute("data-bk-motion", "full");
    const section = document.createElement("div");
    section.className = "schn-section reveal-init";
    const target = document.createElement("form");
    target.id = "direct-order";
    const slot = document.createElement("div");
    section.append(target, slot);
    root.appendChild(section);
    document.body.appendChild(root);
    domRender(<ScrollHint label="x" targetId="direct-order" rtl />, { container: slot });
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS);
    });
    const el = hint();
    expect(el).not.toBeNull();
    expect(el?.parentElement).toBe(root);
    expect(section.contains(el)).toBe(false);
  });

  it("jumps instead of gliding when the tenant turned motion off", () => {
    const root = document.createElement("div");
    root.setAttribute("data-bk-motion", "reduce");
    const target = document.createElement("form");
    target.id = "direct-order";
    const slot = document.createElement("div");
    root.append(target, slot);
    document.body.appendChild(root);
    domRender(<ScrollHint label="x" targetId="direct-order" rtl />, { container: slot });
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS);
    });
    const btn = hint()?.querySelector("button");
    expect(btn).toBeTruthy();
    if (btn) {
      act(() => {
        fireEvent.click(btn);
      });
    }
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});

describe("express view wiring — scroll hint and WhatsApp landmark", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountSection(props: Props, product: Product, overrides: Partial<SectionRenderContext> = {}) {
    const view = domRender(
      <StoreBaseProvider base="/s/fixture-store">
        <Section props={props} ctx={productCtx(product, overrides)} />
      </StoreBaseProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(SCROLL_HINT_DELAY_MS);
    });
    return view;
  }

  const hint = () => document.querySelector("[data-scroll-hint]");

  it("shows the chrome line by default", () => {
    mountSection(EXPRESS_IRAQ_PDP_PROPS, saleProduct);
    expect(hint()?.textContent).toContain("انزل لتحت حتى تكمل طلبك");
  });

  it("the merchant's line overrides the chrome line", () => {
    mountSection({ ...EXPRESS_IRAQ_PDP_PROPS, scroll_hint_i18n: { ar: "الطلب تحت" } }, saleProduct);
    expect(hint()?.textContent).toContain("الطلب تحت");
    expect(hint()?.textContent).not.toContain("انزل لتحت حتى تكمل طلبك");
  });

  it("stays unmounted when the merchant turns it off", () => {
    mountSection({ ...EXPRESS_IRAQ_PDP_PROPS, show_scroll_hint: false }, saleProduct);
    expect(hint()).toBeNull();
  });

  it("stays unmounted when the product is sold out", () => {
    mountSection(EXPRESS_IRAQ_PDP_PROPS, soldOutProduct);
    expect(hint()).toBeNull();
  });

  it("a typed landmark reaches the WhatsApp tile, and only the address line changes", () => {
    const view = mountSection(EXPRESS_IRAQ_PDP_PROPS, saleProduct);
    const field = (sel: string) => {
      const el = view.container.querySelector<HTMLInputElement | HTMLSelectElement>(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return el;
    };
    const tile = () => {
      const a = view.container.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
      if (!a) throw new Error("missing WhatsApp tile");
      return decodeURIComponent(a.href.split("text=")[1] ?? "");
    };
    fireEvent.change(field('input[name="phone"]'), { target: { value: "0770 123 4567" } });
    fireEvent.change(field('input[name="name"]'), { target: { value: "علي" } });
    fireEvent.change(field('select[name="governorate"]'), { target: { value: "BG" } });
    fireEvent.change(field('input[name="address"]'), { target: { value: "المنصور شارع 14" } });
    // Without a landmark the tile is the shared model's link (the classic
    // builder); with one, express rebuilds it — and the two must agree on
    // everything but the address line.
    const before = tile();
    expect(before).toContain("العنوان: المنصور شارع 14");
    fireEvent.change(field('input[name="landmark"]'), { target: { value: "قرب مصرف الرافدين" } });
    const after = tile();
    expect(after).toContain("العنوان: المنصور شارع 14 - قرب مصرف الرافدين");
    expect(after.replace(" - قرب مصرف الرافدين", "")).toBe(before);
  });
});
