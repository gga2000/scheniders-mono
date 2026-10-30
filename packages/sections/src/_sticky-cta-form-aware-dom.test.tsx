// @vitest-environment jsdom
// =====================================================================
// The smart sticky bar beside a real express form (spec §1.8, F04)
// =====================================================================
// Two sections that never pass props to each other, wired only through
// useExpressOrderStore: the bar's label and tap follow the form as the
// shopper fills it — «اطلب الآن» → the phone; «كمّل طلبك / باقي …» → that
// field; «ثبّت طلبي / معلوماتك جاهزة» → the receipt and the submit's focus.
// The bar never sends the order (D6): no request leaves on any tap.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import { EXPRESS_SUBMIT_ID, useExpressOrderStore } from "./helpers/express-order-store";
import pdp_direct_order from "./pdp_direct_order";
import sticky_cta_bar from "./sticky_cta_bar";
import type { Props as StickyProps } from "./sticky_cta_bar";
import { EXPRESS_IRAQ_PDP_PROPS, IRAQ_DRAFT_STICKY_PROPS, plainProduct, productCtx } from "./_pdp-fixtures";

const STICKY: StickyProps = {
  ...IRAQ_DRAFT_STICKY_PROPS,
  primary_kind: "form_aware",
  style: "soft",
  secondary_display: "icon",
};

/** The bar watches the form through an IntersectionObserver; here the form
 *  is reported off screen, so the bar is on screen. */
class OffScreen {
  constructor(private readonly cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.cb([{ isIntersecting: false }]);
  }
  disconnect() {}
}

const scrolled: Element[] = [];
const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));

function mount() {
  const Pdp = pdp_direct_order.render;
  const Bar = sticky_cta_bar.render;
  const ctx = productCtx(plainProduct);
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Pdp props={EXPRESS_IRAQ_PDP_PROPS} ctx={ctx} />
      <Bar props={STICKY} ctx={ctx} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  const primary = () => q<HTMLButtonElement>("[data-sticky-primary]");
  return { view, q, primary };
}

beforeEach(() => {
  scrolled.length = 0;
  fetchMock.mockClear();
  useExpressOrderStore.setState({ forms: {}, watchers: {} });
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("form-aware sticky bar", () => {
  it("untouched: «اطلب الآن», and a tap focuses the phone", () => {
    const { q, primary } = mount();
    expect(primary().dataset.stickyPrimary).toBe("untouched");
    expect(primary().textContent).toBe("اطلب الآن");
    fireEvent.click(primary());
    expect(document.activeElement).toBe(q('input[name="phone"]'));
    expect(scrolled).toEqual([q('input[name="phone"]')]);
  });

  it("partial: «كمّل طلبك» over «باقي اسمك», and a tap focuses the name", () => {
    const { q, primary } = mount();
    fireEvent.change(q('input[name="phone"]'), { target: { value: "0770 123 4567" } });
    expect(primary().dataset.stickyPrimary).toBe("partial");
    expect(primary().textContent).toBe("كمّل طلبكباقي اسمك");
    fireEvent.click(primary());
    expect(document.activeElement).toBe(q('input[name="name"]'));
  });

  it("complete: «ثبّت طلبي» over «معلوماتك جاهزة»; a tap shows the receipt, focuses the submit, sends nothing", () => {
    const { q, primary } = mount();
    fireEvent.change(q('input[name="phone"]'), { target: { value: "0770 123 4567" } });
    fireEvent.change(q('input[name="name"]'), { target: { value: "علي" } });
    fireEvent.change(q('select[name="governorate"]'), { target: { value: "BG" } });
    fireEvent.change(q('input[name="address"]'), { target: { value: "المنصور" } });
    expect(primary().dataset.stickyPrimary).toBe("complete");
    expect(primary().textContent).toBe("checkثبّت طلبيمعلوماتك جاهزة");
    fetchMock.mockClear();
    fireEvent.click(primary());
    expect(document.activeElement?.id).toBe(EXPRESS_SUBMIT_ID);
    expect(scrolled.map((e) => e.hasAttribute("data-receipt"))).toEqual([true]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the WhatsApp icon opens the chat with the product named", () => {
    const { q } = mount();
    const href = q<HTMLAnchorElement>('[data-sticky-secondary="icon"]').getAttribute("href") ?? "";
    expect(decodeURIComponent(href.split("?text=")[1] ?? "")).toBe("هلا، أريد أطلب عطر تجريبي");
  });
});
