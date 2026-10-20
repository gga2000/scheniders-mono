// =====================================================================
// FunnelBeacon — the first-party funnel's client half (W6.7)
// =====================================================================
// One page_view per page render, a view_product on product pages, and a sink
// that carries the sections' AddToCart / InitiateCheckout to /api/events.
// Batches never exceed what the route accepts, and nothing is stranded.
// =====================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { trackPixel } from "@scheniders/sections/helpers/pixels";
import { pixelContentsFromItems } from "@scheniders/shared";
import { FunnelBeacon } from "./funnel-beacon";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PRODUCT = "11111111-1111-4111-8111-111111111111";

type Batch = { tenant_id: string; events: Array<{ type: string; page_id?: string; product_id?: string }> };

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
  Promise.resolve(new Response(null, { status: 204 })),
);

function batches(): Batch[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)) as Batch);
}

function mount(props: { pageId: string; productId?: string }) {
  act(() => {
    root.render(React.createElement(FunnelBeacon, { tenantId: TENANT, ...props }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("FunnelBeacon", () => {
  it("sends a page view and a product view for a product page, in one batch", () => {
    mount({ pageId: "product", productId: PRODUCT });
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/events");
    expect(batches()).toEqual([
      {
        tenant_id: TENANT,
        events: [
          { type: "page_view", page_id: "product" },
          { type: "view_product", product_id: PRODUCT, page_id: "product" },
        ],
      },
    ]);
  });

  it("carries the sections' add-to-cart through the sink, stamped with the page", () => {
    mount({ pageId: "home" });
    act(() => {
      trackPixel("AddToCart", pixelContentsFromItems([{ product_id: PRODUCT, price: 1000, quantity: 1 }]));
      vi.advanceTimersByTime(800);
    });
    expect(batches()[0]?.events).toEqual([
      { type: "page_view", page_id: "home" },
      { type: "add_to_cart", product_id: PRODUCT, page_id: "home" },
    ]);
  });

  it("splits a long queue into batches the route accepts instead of stranding the rest", () => {
    mount({ pageId: "category" });
    const items = pixelContentsFromItems([{ product_id: PRODUCT, price: 1000, quantity: 1 }]);
    act(() => {
      for (let i = 0; i < 24; i += 1) trackPixel("AddToCart", items);
      vi.advanceTimersByTime(800);
    });
    const sent = batches();
    expect(sent.map((b) => b.events.length)).toEqual([20, 5]);
  });

  it("flushes what is queued when the page unmounts, and stops forwarding", () => {
    mount({ pageId: "home" });
    act(() => root.unmount());
    expect(batches()[0]?.events).toEqual([{ type: "page_view", page_id: "home" }]);
    fetchMock.mockClear();
    trackPixel("AddToCart", pixelContentsFromItems([{ product_id: PRODUCT, price: 1, quantity: 1 }]));
    vi.advanceTimersByTime(2000);
    expect(fetchMock).not.toHaveBeenCalled();
    // afterEach unmounts again; give it a fresh root to unmount.
    root = createRoot(container);
  });
});
