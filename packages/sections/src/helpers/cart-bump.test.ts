// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { CartItem } from "@scheniders/shared";
import { CART_BUMP_MS, useCartBump } from "./cart-bump";
import { useCart } from "./cart-store";

const LINE: CartItem = {
  product_id: "11111111-1111-4111-8111-111111111111",
  variant_id: null,
  name: "عطر",
  variant_name: null,
  price: 25000,
  quantity: 1,
  image_url: null,
  base_price: 25000,
};
const OTHER: CartItem = { ...LINE, product_id: "22222222-2222-4222-8222-222222222222" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(useCart.persist, "hasHydrated").mockReturnValue(true);
  useCart.setState({ items: [LINE] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useCartBump", () => {
  it("pops on an add and settles after CART_BUMP_MS", () => {
    const { result } = renderHook(() => useCartBump());
    act(() => useCart.getState().addItem(OTHER));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(CART_BUMP_MS));
    expect(result.current).toBe(false);
  });

  it("a fall inside the pop (a direct order retiring the line) settles it at once", () => {
    const { result } = renderHook(() => useCartBump());
    act(() => useCart.getState().addItem(OTHER));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(CART_BUMP_MS / 3));
    act(() => useCart.getState().removeProduct(OTHER.product_id));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(CART_BUMP_MS));
    expect(result.current).toBe(false);
  });

  it("a second add inside the pop keeps it popped for a full CART_BUMP_MS", () => {
    const { result } = renderHook(() => useCartBump());
    act(() => useCart.getState().addItem(OTHER));
    act(() => vi.advanceTimersByTime(CART_BUMP_MS / 2));
    act(() => useCart.getState().addItem(OTHER));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(CART_BUMP_MS - 1));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });
});
