// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order express — the form reports its progress (slice 1f)
// =====================================================================
// The express form registers in useExpressOrderStore while mounted and
// reports, after every change, what a form-aware sticky bar needs: the
// required fields still missing, the first one's id and label, and the
// submit's id and label. The receipt and the submit carry the bar's marks
// only while a bar watches the product.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import {
  EXPRESS_SUBMIT_ID,
  UNREGISTERED,
  expressFormOf,
  expressFormStage,
  useExpressOrderStore,
} from "./helpers/express-order-store";
import pdp_direct_order from "./pdp_direct_order";
import { EXPRESS_IRAQ_PDP_PROPS, plainProduct, productCtx } from "./_pdp-fixtures";

function mount() {
  const Section = pdp_direct_order.render;
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={EXPRESS_IRAQ_PDP_PROPS} ctx={productCtx(plainProduct)} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return { view, q };
}

const progress = () => expressFormOf(useExpressOrderStore.getState(), plainProduct.id);

beforeEach(() => {
  useExpressOrderStore.setState({ forms: {}, watchers: {} });
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
  vi.unstubAllGlobals();
});

describe("express form progress", () => {
  it("registers untouched, names the next field as it fills, and unregisters on unmount", () => {
    const { view, q } = mount();
    expect(expressFormStage(progress())).toBe("untouched");
    expect(progress().owner).not.toBe("");
    expect(progress().firstMissingId).toBe(q<HTMLInputElement>('input[name="phone"]').id);
    expect(progress().firstMissingLabel).toBe("رقم الموبايل");
    expect(progress().submitLabel).toBe("ثبّت طلبي");

    fireEvent.change(q('input[name="phone"]'), { target: { value: "0770 123 4567" } });
    expect(expressFormStage(progress())).toBe("partial");
    expect(progress().firstMissingId).toBe(q<HTMLInputElement>('input[name="name"]').id);
    expect(progress().firstMissingLabel).toBe("اسمك");

    fireEvent.change(q('input[name="name"]'), { target: { value: "علي" } });
    fireEvent.change(q('select[name="governorate"]'), { target: { value: "BG" } });
    expect(progress().missing).toEqual(["address_details"]);
    expect(progress().firstMissingLabel).toBe("المنطقة والشارع");

    fireEvent.change(q('input[name="address"]'), { target: { value: "المنصور" } });
    expect(expressFormStage(progress())).toBe("complete");
    expect(progress().submitId).toBe(EXPRESS_SUBMIT_ID);

    view.unmount();
    expect(progress()).toBe(UNREGISTERED);
  });

  it("marks the receipt and the submit only while a bar watches", () => {
    const { view } = mount();
    const marks = () => [
      view.container.querySelectorAll("[data-receipt]").length,
      view.container.querySelectorAll(`#${EXPRESS_SUBMIT_ID}`).length,
    ];
    expect(marks()).toEqual([0, 0]);
    let unwatch = () => {};
    act(() => {
      unwatch = useExpressOrderStore.getState().watchForm(plainProduct.id);
    });
    expect(marks()).toEqual([1, 1]);
    expect(view.container.querySelector(`#${EXPRESS_SUBMIT_ID}`)?.getAttribute("type")).toBe("submit");
    act(() => unwatch());
    expect(marks()).toEqual([0, 0]);
  });

  it("two forms for the same product: unmounting the first leaves the second registered", () => {
    const first = mount();
    const second = mount();
    expect(expressFormStage(progress())).toBe("untouched");
    first.view.unmount();
    expect(progress().registered).toBe(true);
    fireEvent.change(second.q('input[name="phone"]'), { target: { value: "0770 123 4567" } });
    expect(expressFormStage(progress())).toBe("partial");
    second.view.unmount();
    expect(progress()).toBe(UNREGISTERED);
  });
});
