// =====================================================================
// PixelRouteChange — PageView re-fire on client navigation (P2-29)
// =====================================================================
// The inline pixel scripts fire the first PageView on load; this island
// must fire ONLY on subsequent pathname changes, once per change, and
// only for the pixels whose globals exist.
// =====================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/s/acme";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { PixelRouteChange } from "./pixel-route-change";

type PixelWindow = Window & {
  fbq?: (...args: unknown[]) => void;
  ttq?: { track: (...args: unknown[]) => void; page: () => void };
  snaptr?: (...args: unknown[]) => void;
};

let container: HTMLDivElement;
let root: Root;
const w = window as PixelWindow;

function mount() {
  act(() => {
    root.render(React.createElement(PixelRouteChange));
  });
}

beforeEach(() => {
  pathname = "/s/acme";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete w.fbq;
  delete w.ttq;
  delete w.snaptr;
});

describe("PixelRouteChange", () => {
  it("does not fire on the initial render (the inline script already did)", () => {
    const fbq = vi.fn();
    w.fbq = fbq;
    mount();
    expect(fbq).not.toHaveBeenCalled();
  });

  it("fires PageView / ttq.page / PAGE_VIEW once per pathname change", () => {
    const fbq = vi.fn();
    const page = vi.fn();
    const snaptr = vi.fn();
    w.fbq = fbq;
    w.ttq = { track: vi.fn(), page };
    w.snaptr = snaptr;
    mount();
    pathname = "/s/acme/products/perfume";
    mount();
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq).toHaveBeenCalledWith("track", "PageView");
    expect(page).toHaveBeenCalledTimes(1);
    expect(snaptr).toHaveBeenCalledWith("track", "PAGE_VIEW");
    // A re-render on the same path is not a navigation.
    mount();
    expect(fbq).toHaveBeenCalledTimes(1);
    pathname = "/s/acme/cart";
    mount();
    expect(fbq).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for pixels that were never initialised", () => {
    const fbq = vi.fn();
    w.fbq = fbq;
    mount();
    pathname = "/s/acme/cart";
    expect(() => mount()).not.toThrow();
    expect(fbq).toHaveBeenCalledTimes(1);
  });
});
