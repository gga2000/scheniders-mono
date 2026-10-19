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
  it("asks nothing of a plain product", () => {
    const plain = renderHook(() => useSelectedVariant(base)).result.current;
    expect(plain.variant).toBeNull();
    expect(plain.soldByVariant).toBe(false);
    expect(plain.needsVariant).toBe(false);
  });

  it("never chooses on the shopper's behalf — not even the only variant", () => {
    const one = { ...base, variants: [two.variants![0]] };
    const h = renderHook(() => useSelectedVariant(one));
    expect(h.result.current.variant).toBeNull();
    expect(h.result.current.needsVariant).toBe(true);
    act(() => h.result.current.select("v50"));
    expect(h.result.current.variant?.id).toBe("v50");
    expect(h.result.current.needsVariant).toBe(false);
  });

  it("treats a product flagged sold_by_variant as needing a choice even without its list", () => {
    const flagged: Product = { ...base, sold_by_variant: true };
    const h = renderHook(() => useSelectedVariant(flagged)).result.current;
    expect(h.soldByVariant).toBe(true);
    expect(h.needsVariant).toBe(true);
  });

  it("ignores a stored id that is not one of the product's variants", () => {
    useVariantStore.setState({ selected: { p1: "gone" }, pickers: {} });
    expect(renderHook(() => useSelectedVariant(two)).result.current.variant).toBeNull();
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
