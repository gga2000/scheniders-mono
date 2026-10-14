// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelectedVariant, useVariantStore, stockLeftFor } from "./variant-store";
import type { Product } from "../types";

const base: Product = { id: "p1", name: "عطر", price: 25000, stock_quantity: 3, reserved_quantity: 0, is_archived: false };
const two: Product = {
  ...base,
  variants: [
    { id: "v50", product_id: "p1", name: "50ml", price: 25000, stock_quantity: 5, reserved_quantity: 1 },
    { id: "v100", product_id: "p1", name: "100ml", price: 40000, stock_quantity: 0 },
  ],
};

beforeEach(() => useVariantStore.setState({ selected: {}, pickers: {} }));

describe("useSelectedVariant", () => {
  it("is empty for a plain product and implicit for a single variant", () => {
    expect(renderHook(() => useSelectedVariant(base)).result.current.variant).toBeNull();
    const one = { ...base, variants: [two.variants![0]] };
    expect(renderHook(() => useSelectedVariant(one)).result.current.variant?.id).toBe("v50");
  });

  it("requires an explicit choice with several variants, and shares it across sections", () => {
    const a = renderHook(() => useSelectedVariant(two));
    const b = renderHook(() => useSelectedVariant(two));
    expect(a.result.current.variant).toBeNull();
    act(() => a.result.current.select("v100"));
    expect(b.result.current.variant?.name).toBe("100ml");
    // Another product's choice is its own.
    expect(renderHook(() => useSelectedVariant({ ...two, id: "p2" })).result.current.variant).toBeNull();
  });

  it("knows when a picker section is mounted", () => {
    const h = renderHook(() => useSelectedVariant(two));
    expect(h.result.current.pickerMounted).toBe(false);
    let off = () => {};
    act(() => { off = useVariantStore.getState().registerPicker("p1"); });
    expect(h.result.current.pickerMounted).toBe(true);
    act(() => off());
    expect(h.result.current.pickerMounted).toBe(false);
  });

  it("counts stock for the chosen variant, else the product", () => {
    expect(stockLeftFor(two, two.variants![0])).toBe(4);
    expect(stockLeftFor(two, two.variants![1])).toBe(0);
    expect(stockLeftFor(base, null)).toBe(3);
  });
});
