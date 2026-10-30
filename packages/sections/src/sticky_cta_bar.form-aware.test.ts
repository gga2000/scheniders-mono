// @vitest-environment jsdom
// The form-aware bar's label and tap target per state (spec §1.8), the
// WhatsApp link, and the hand-off: it scrolls and focuses, never submits.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNREGISTERED, type ExpressFormProgress } from "./helpers/express-order-store";
import { handOffToForm, stickyPrimary, stickyWhatsappHref } from "./sticky_cta_bar.form-aware";

const PID = "11111111-1111-4111-8111-111111111111";

const registered = (over: Partial<ExpressFormProgress>): ExpressFormProgress => ({
  ...UNREGISTERED,
  registered: true,
  owner: "form-1",
  ...over,
});

describe("stickyPrimary", () => {
  it("none: the start label and today's scroll to the form", () => {
    expect(stickyPrimary(UNREGISTERED, "اطلب الآن", "ar")).toEqual({
      stage: "none",
      label: "اطلب الآن",
      sub: null,
      target: { kind: "form" },
    });
  });

  it("untouched: the start label, aimed at the first empty field", () => {
    const p = registered({ firstMissingId: "f-phone", firstMissingLabel: "رقم الموبايل" });
    expect(stickyPrimary(p, "اطلب الآن", "ar")).toEqual({
      stage: "untouched",
      label: "اطلب الآن",
      sub: null,
      target: { kind: "field", id: "f-phone" },
    });
  });

  it("partial: «كمّل طلبك» over «باقي {field}», aimed at that field", () => {
    const p = registered({
      missing: ["address_details"],
      firstMissingId: "f-address_details",
      firstMissingLabel: "المنطقة والشارع",
    });
    expect(stickyPrimary(p, "اطلب الآن", "ar")).toEqual({
      stage: "partial",
      label: "كمّل طلبك",
      sub: "باقي المنطقة والشارع",
      target: { kind: "field", id: "f-address_details" },
    });
    expect(stickyPrimary(p, "Order now", "en").label).toBe("Finish your order");
  });

  it("complete: the form's own submit label, aimed at the submit — never a submit", () => {
    const p = registered({ missing: [], submitId: "direct-order-submit", submitLabel: "ثبّت طلبي" });
    expect(stickyPrimary(p, "اطلب الآن", "ar")).toEqual({
      stage: "complete",
      label: "ثبّت طلبي",
      sub: "معلوماتك جاهزة",
      target: { kind: "submit", id: "direct-order-submit" },
    });
    expect(stickyPrimary({ ...p, submitLabel: null }, "اطلب الآن", "ar").label).toBe("اطلب الآن");
  });
});

describe("stickyPrimary: an option still to choose", () => {
  it("partial: «باقي اختار الخيار», aimed at the option group, not a field", () => {
    const p = registered({
      missing: ["variant"],
      firstMissingId: "direct-order-variants",
      firstMissingLabel: "اختار الخيار",
    });
    expect(stickyPrimary(p, "اطلب الآن", "ar")).toEqual({
      stage: "partial",
      label: "كمّل طلبك",
      sub: "باقي اختار الخيار",
      target: { kind: "variant", id: "direct-order-variants" },
    });
  });

  it("untouched with the option first: the start label, aimed at the option", () => {
    const p = registered({
      missing: ["variant", "phone", "customer_name", "governorate_code", "address_details"],
      firstMissingId: null,
      firstMissingLabel: "اختار الخيار",
    });
    expect(stickyPrimary(p, "اطلب الآن", "ar").target).toEqual({ kind: "variant", id: null });
  });
});

describe("stickyWhatsappHref", () => {
  it("prefills the message, encoded; no number, no link", () => {
    expect(stickyWhatsappHref("07779703832", "هلا، أريد أطلب ويفر انتنس")).toBe(
      `https://wa.me/9647779703832?text=${encodeURIComponent("هلا، أريد أطلب ويفر انتنس")}`,
    );
    expect(stickyWhatsappHref("07779703832", " ")).toBe("https://wa.me/9647779703832");
    expect(stickyWhatsappHref(null, "x")).toBeNull();
  });
});

describe("handOffToForm", () => {
  const scrolled: Element[] = [];
  beforeEach(() => {
    scrolled.length = 0;
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    document.body.innerHTML = `
      <form id="direct-order">
        <input id="f-phone" />
        <div inert><input id="f-name" /></div>
        <div data-receipt>total</div>
        <button type="submit" id="direct-order-submit">ثبّت طلبي</button>
      </form>`;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("a field: scrolled into view and focused", () => {
    const fallback = vi.fn();
    handOffToForm({ kind: "field", id: "f-phone" }, fallback, PID);
    expect(document.activeElement?.id).toBe("f-phone");
    expect(scrolled.map((e) => e.id)).toEqual(["f-phone"]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("a field in a closed (inert) stage, or a missing one: the fallback", () => {
    const fallback = vi.fn();
    handOffToForm({ kind: "field", id: "f-name" }, fallback, PID);
    handOffToForm({ kind: "field", id: "nope" }, fallback, PID);
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(scrolled).toEqual([]);
  });

  it("complete: the receipt comes into view, the submit gets focus, and nothing is submitted", () => {
    const submitted = vi.fn((e: Event) => e.preventDefault());
    document.getElementById("direct-order")?.addEventListener("submit", submitted);
    handOffToForm({ kind: "submit", id: "direct-order-submit" }, vi.fn(), PID);
    expect(scrolled.map((e) => e.hasAttribute("data-receipt"))).toEqual([true]);
    expect(document.activeElement?.id).toBe("direct-order-submit");
    expect(submitted).not.toHaveBeenCalled();
  });

  it("complete without the marks (no bar watching yet): the fallback", () => {
    document.querySelector("[data-receipt]")?.removeAttribute("data-receipt");
    const fallback = vi.fn();
    handOffToForm({ kind: "submit", id: "direct-order-submit" }, fallback, PID);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("complete while the submit is disabled (sending): the receipt comes into view, nothing takes focus", () => {
    const submit = document.getElementById("direct-order-submit");
    if (!(submit instanceof HTMLButtonElement)) throw new Error("missing submit");
    submit.disabled = true;
    const before = document.activeElement;
    const fallback = vi.fn();
    handOffToForm({ kind: "submit", id: "direct-order-submit" }, fallback, PID);
    expect(scrolled.map((e) => e.hasAttribute("data-receipt"))).toEqual([true]);
    expect(document.activeElement).toBe(before);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("an option: the group comes into view and its first enabled choice takes focus", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="direct-order-variants" role="group">
        <button type="button" id="v-out" disabled>50ml</button>
        <button type="button" id="v-in">100ml</button>
      </div>`,
    );
    const fallback = vi.fn();
    handOffToForm({ kind: "variant", id: "direct-order-variants" }, fallback, PID);
    expect(scrolled.map((e) => e.id)).toEqual(["direct-order-variants"]);
    expect(document.activeElement?.id).toBe("v-in");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("an option owned by a picker section: that picker's first choice takes focus", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div data-variant-picker="other"><button type="button" id="other-1">x</button></div>
       <div data-variant-picker="${PID}"><select id="picker-select"><option>50ml</option></select></div>`,
    );
    handOffToForm({ kind: "variant", id: null }, vi.fn(), PID);
    expect(document.activeElement?.id).toBe("picker-select");
  });

  it("an option with nothing to choose on the page: the fallback", () => {
    const fallback = vi.fn();
    handOffToForm({ kind: "variant", id: "direct-order-variants" }, fallback, PID);
    handOffToForm({ kind: "variant", id: null }, fallback, PID);
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(scrolled).toEqual([]);
  });
});
