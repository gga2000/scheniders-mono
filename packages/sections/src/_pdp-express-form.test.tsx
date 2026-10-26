// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order express — the staged order form
// =====================================================================
// What only a DOM can show: the form opens a step at a time (phone →
// name → governorate + address → landmark + backup number), with a hint
// while the phone is incomplete; reveal follows the current values and
// errors; ticks never outlive the value they approved; the greeting
// heading is one stable live region; the grouped phone keeps the caret
// and lets Backspace/Delete cross a group space; and a failed submit
// focuses the first invalid field in the express order, after its stage
// has opened.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { GovernorateCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import {
  EXPRESS_IRAQ_PDP_PROPS,
  plainProduct,
  productCtx,
  productRuntime,
} from "./_pdp-fixtures";

const NEXT_HINT = "بعد ما تكمل الرقم نسألك عن اسمك وعنوانك";

/** `governorate` is a returning shopper's sb_gov cookie prefill. */
function mount({ governorate }: { governorate?: GovernorateCode } = {}) {
  const Section = pdp_direct_order.render;
  const ctx = productCtx(
    plainProduct,
    governorate ? { runtime: { ...productRuntime, governorate } } : {},
  );
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={EXPRESS_IRAQ_PDP_PROPS} ctx={ctx} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return {
    view,
    phone: () => q<HTMLInputElement>('input[name="phone"]'),
    name: () => q<HTMLInputElement>('input[name="name"]'),
    governorate: () => q<HTMLSelectElement>('select[name="governorate"]'),
    address: () => q<HTMLInputElement>('input[name="address"]'),
    landmark: () => q<HTMLInputElement>('input[name="landmark"]'),
    form: () => q<HTMLFormElement>("form"),
    heading: () => q<HTMLHeadingElement>('[data-layer="form"] h2'),
    stage: (step: "name" | "address" | "extras") => q<HTMLElement>(`[data-stage="${step}"]`),
  };
}

type View = ReturnType<typeof mount>;

function isOpen(v: View, step: "name" | "address" | "extras"): boolean {
  const stage = v.stage(step);
  const clip = stage.firstElementChild;
  return stage.dataset.open === "true" && clip !== null && !clip.hasAttribute("inert");
}

/** A real edit as the browser delivers it: the native value changes, the
 *  caret sits where the browser left it, then an `input` event fires. */
function edit(input: HTMLInputElement, value: string, caret: number, inputType: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("no value setter");
  act(() => {
    input.focus();
    setter.call(input, value);
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
  });
}

function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("express form — staged reveal", () => {
  it("opens one stage at a time, each gated on the one before", () => {
    vi.useFakeTimers();
    const v = mount();
    expect(isOpen(v, "name")).toBe(false);
    expect(isOpen(v, "address")).toBe(false);
    expect(isOpen(v, "extras")).toBe(false);
    expect(v.view.container.textContent).not.toContain(NEXT_HINT);

    // Typing an incomplete number: the hint promises the next fields.
    type(v.phone(), "0770 12");
    expect(v.view.container.textContent).toContain(NEXT_HINT);
    expect(v.phone().getAttribute("aria-describedby")).toBeTruthy();
    expect(isOpen(v, "name")).toBe(false);

    // A complete, valid number opens the name — and only the name.
    type(v.phone(), "0770 123 4567");
    expect(isOpen(v, "name")).toBe(true);
    expect(isOpen(v, "address")).toBe(false);
    expect(v.view.container.textContent).not.toContain(NEXT_HINT);

    // One letter is not a name; two letters open the address after a pause.
    type(v.name(), "ع");
    act(() => vi.advanceTimersByTime(2000));
    expect(isOpen(v, "address")).toBe(false);
    type(v.name(), "علي");
    expect(isOpen(v, "address")).toBe(false);
    act(() => vi.advanceTimersByTime(2000));
    expect(isOpen(v, "address")).toBe(true);
    expect(isOpen(v, "extras")).toBe(false);

    // Governorate + address together open the last stage.
    type(v.governorate(), "BG");
    expect(isOpen(v, "extras")).toBe(false);
    type(v.address(), "المنصور");
    expect(isOpen(v, "extras")).toBe(true);
  });

  it("leaving the name field opens the address stage without waiting", () => {
    const v = mount();
    type(v.phone(), "07701234567");
    type(v.name(), "علي حسن");
    expect(isOpen(v, "address")).toBe(false);
    fireEvent.blur(v.name());
    expect(isOpen(v, "address")).toBe(true);
  });

  it("the late item's beat is zeroed by the tenant motion-off toggle", () => {
    const v = mount();
    type(v.landmark(), "قرب الجسر");
    const late = v.address().closest('[class*="delay-"]');
    expect(late?.className).toContain("delay-[var(--bk-duration-fast)]");
    // globals.css zeroes durations (not delays) under data-bk-motion=reduce.
    expect(late?.className).toContain("[[data-bk-motion=reduce]_&]:delay-0");
  });

  it("reveal follows the values: content keeps its stage (and earlier ones) open", () => {
    const v = mount();
    type(v.landmark(), "قرب الجسر");
    expect(isOpen(v, "extras")).toBe(true);
    expect(isOpen(v, "address")).toBe(true);
    expect(isOpen(v, "name")).toBe(true);
    type(v.landmark(), "");
    expect(isOpen(v, "extras")).toBe(false);
    expect(isOpen(v, "name")).toBe(false);
  });
});

describe("express form — heading, ticks, phone check placement", () => {
  it("greets on the same live h2 element and drops a stale greeting", () => {
    const v = mount();
    const h2 = v.heading();
    expect(h2.getAttribute("aria-live")).toBe("polite");
    type(v.phone(), "07701234567");
    type(v.name(), "علي حسن");
    fireEvent.blur(v.name());
    expect(v.heading()).toBe(h2);
    expect(h2.textContent).toContain("علي");
    // Editing the first name: the old greeting goes, the element stays.
    type(v.name(), "عمر");
    expect(v.heading()).toBe(h2);
    expect(h2.textContent).not.toContain("علي");
  });

  it("never greets a half-typed name: a pause opens the address, not the greeting", () => {
    vi.useFakeTimers();
    const v = mount();
    const title = v.heading().textContent;
    type(v.phone(), "07701234567");
    // A slow typer stops mid-word, long enough for the pause to settle.
    type(v.name(), "مح");
    act(() => vi.advanceTimersByTime(2000));
    expect(isOpen(v, "address")).toBe(true);
    expect(v.heading().textContent).toBe(title);
    expect(v.view.container.textContent).not.toContain("مح؟");
    type(v.name(), "محم");
    act(() => vi.advanceTimersByTime(2000));
    expect(v.heading().textContent).toBe(title);
    // Leaving the field: the finished name is greeted, once.
    type(v.name(), "محمد علي");
    fireEvent.blur(v.name());
    expect(v.heading().textContent).toContain("محمد");
    expect(v.heading().textContent).not.toBe(title);
  });

  it("success ticks follow the current value", () => {
    const v = mount();
    type(v.phone(), "07701234567");
    type(v.name(), "علي");
    fireEvent.blur(v.name());
    const nameTick = () => v.name().parentElement?.querySelector(".text-bk-success") ?? null;
    expect(nameTick()).not.toBeNull();
    type(v.name(), "");
    expect(nameTick()).toBeNull();
  });

  it("pins the phone check to the right and pads for it, in Arabic too", () => {
    const v = mount();
    type(v.phone(), "07701234567");
    const icon = v.phone().parentElement?.querySelector(".text-bk-success");
    expect(icon?.className).toContain("right-3");
    expect(icon?.className).not.toContain("left-3");
    expect(v.phone().className).toContain("pr-10");
    // Arabic text inputs pad the icon side (left).
    expect(v.name().className).toContain("pl-10");
  });
});

describe("express form — grouped phone caret", () => {
  it("Backspace over a group space deletes the digit before it and keeps the caret", () => {
    const v = mount();
    type(v.phone(), "0780 230");
    edit(v.phone(), "0780230", 4, "deleteContentBackward");
    expect(v.phone().value).toBe("0782 30");
    expect(v.phone().selectionStart).toBe(3);
  });

  it("Delete over a group space deletes the digit after it", () => {
    const v = mount();
    type(v.phone(), "0780 230");
    edit(v.phone(), "0780230", 4, "deleteContentForward");
    expect(v.phone().value).toBe("0780 30");
    expect(v.phone().selectionStart).toBe(4);
  });

  it("restores the caret even when the value is unchanged (a typed letter)", () => {
    const v = mount();
    type(v.phone(), "0780 230");
    edit(v.phone(), "07a80 230", 3, "insertText");
    expect(v.phone().value).toBe("0780 230");
    expect(v.phone().selectionStart).toBe(2);
  });

  it("the backup number uses the same grouping and caret handling", () => {
    const v = mount();
    type(v.landmark(), "قرب الجسر");
    const add = [...v.view.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("أضف رقم ثاني"),
    );
    if (!add) throw new Error("missing add-backup button");
    fireEvent.click(add);
    const alt = v.view.container.querySelector<HTMLInputElement>('input[name="alt_phone"]');
    if (!alt) throw new Error("missing alt_phone");
    expect(document.activeElement).toBe(alt);
    edit(alt, "07801", 5, "insertText");
    expect(alt.value).toBe("0780 1");
    expect(alt.selectionStart).toBe(6);
  });
});

describe("express form — submit errors", () => {
  it("an empty submit opens every stage with an error and focuses the phone", () => {
    const v = mount();
    fireEvent.submit(v.form());
    expect(isOpen(v, "name")).toBe(true);
    expect(isOpen(v, "address")).toBe(true);
    expect(document.activeElement).toBe(v.phone());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("focuses the first invalid field in the express order, once its stage is open", () => {
    const v = mount();
    type(v.phone(), "07701234567");
    fireEvent.submit(v.form());
    // Classic order would pick customer_name too; here phone is valid and
    // the name comes next in the express order.
    expect(document.activeElement).toBe(v.name());
    expect(isOpen(v, "name")).toBe(true);
  });

  it("a stage stays open under the focused field once its submit error is cleared", () => {
    // The cookie governorate is no error and not typed this visit, so only
    // the address error holds the address stage open after the submit.
    const v = mount({ governorate: "BG" });
    expect(v.governorate().value).toBe("BG");
    type(v.phone(), "07701234567");
    expect(isOpen(v, "address")).toBe(false);
    fireEvent.submit(v.form());
    expect(isOpen(v, "address")).toBe(true);
    act(() => v.address().focus());
    type(v.address(), "x");
    type(v.address(), "");
    expect(document.activeElement).toBe(v.address());
    expect(isOpen(v, "address")).toBe(true);
    // Leaving it with nothing typed lets the values decide again.
    act(() => v.address().blur());
    expect(isOpen(v, "address")).toBe(false);
  });

  it("a stage stays open while focus moves between its own fields", () => {
    const v = mount({ governorate: "BG" });
    type(v.phone(), "07701234567");
    fireEvent.submit(v.form());
    act(() => v.address().focus());
    type(v.address(), "x");
    type(v.address(), "");
    act(() => v.governorate().focus());
    expect(isOpen(v, "address")).toBe(true);
  });

  it("skips valid fields: a missing governorate is focused before the address", () => {
    const v = mount();
    type(v.phone(), "07701234567");
    type(v.name(), "علي");
    // jsdom does not enforce `inert`, so record it at the moment of focus:
    // a browser drops focus() on an element inside an inert subtree.
    const inertAtFocus: boolean[] = [];
    const focus = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function record(this: HTMLElement) {
        inertAtFocus.push(this.closest("[inert]") !== null);
        focus.mockRestore();
        this.focus();
      });
    expect(isOpen(v, "address")).toBe(false);
    fireEvent.submit(v.form());
    expect(inertAtFocus).toEqual([false]);
    expect(document.activeElement).toBe(v.governorate());
    expect(isOpen(v, "address")).toBe(true);
    expect(isOpen(v, "extras")).toBe(false);
  });
});
