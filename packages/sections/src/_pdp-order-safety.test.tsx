// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order — never lose the buyer (spec 2026-10-21 §2)
// =====================================================================
// Both layouts share one submit path, so every case runs on each: a reload
// restores what this tab typed (and the in-flight key); a stalled submit is
// resent once with the SAME key while the button reads «نتأكد من طلبك…» and
// cannot be tapped; when neither attempt is answered the same order is
// offered on WhatsApp and the key is kept; a placed order clears the draft;
// and the server's duplicate answer says «طلبك واصلنا، لا تطلبه مرة ثانية»
// with no second Purchase and no thank-you page.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import { orderDraftKey, readOrderDraft, writeOrderDraft } from "./helpers/order-draft";
import { ORDER_SUBMIT_TIMEOUT_MS } from "./helpers/submit-order";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { FormState } from "./pdp_direct_order.client";
import { fixtureTenant, plainProduct, productCtx } from "./_pdp-fixtures";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const TENANT = fixtureTenant.id;
const PRODUCT = plainProduct.id;
const FILLED: FormState = {
  customer_name: "زبون تجريبي",
  phone: "07802301677",
  alt_phone: "",
  governorate_code: "BG",
  address_details: "الكرادة قرب الجسر",
};

const LAYOUTS: Array<[string, Props]> = [["classic", pdp_direct_order.defaultProps]];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A request that never answers — until its signal aborts it. */
function hanging(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
}

function stubFetch(impl: FetchFn) {
  const fn = vi.fn<FetchFn>(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** The idempotency key of every order POST, in order. */
function orderKeys(fn: ReturnType<typeof stubFetch>): string[] {
  return fn.mock.calls
    .filter(([url]) => url === "/api/checkout/orders")
    .map(([, init]) => (JSON.parse(String(init?.body)) as { idempotency_key: string }).idempotency_key);
}

/** Lets a rejected/resolved fetch chain run to its state update. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function fbqMock(): ReturnType<typeof vi.fn> {
  return (globalThis as unknown as { fbq: ReturnType<typeof vi.fn> }).fbq;
}

function mount(props: Props) {
  const Section = pdp_direct_order.render;
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(plainProduct)} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return {
    view,
    form: () => q<HTMLFormElement>("form#direct-order"),
    submit: () => q<HTMLButtonElement>('button[type="submit"]'),
    phone: () => q<HTMLInputElement>('input[name="phone"]'),
    name: () => q<HTMLInputElement>('input[name="name"]'),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(LAYOUTS)("pdp_direct_order %s — never lose the buyer", (_layout, props) => {
  it("restores what this tab typed after a reload", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    const v = mount(props);
    expect(v.name().value).toBe(FILLED.customer_name);
    expect(v.phone().value.replace(/\D/g, "")).toBe(FILLED.phone);
  });

  it("resubmits a restored in-flight order with ITS key — a replay, not a second order", async () => {
    writeOrderDraft(TENANT, PRODUCT, {
      form: FILLED,
      idempotencyKey: "restored-key-0001",
      purchaseEventId: "restored-evt-0001",
    });
    const fetchFn = stubFetch(async () => json(200, { success: true, replayed: true, orderNumber: "SH-0001" }));
    const v = mount(props);
    await act(async () => {
      fireEvent.submit(v.form());
    });
    await waitFor(() => expect(orderKeys(fetchFn)).toEqual(["restored-key-0001"]));
  });

  it("resends once with the same key after a timeout, then offers the order on WhatsApp", async () => {
    vi.useFakeTimers();
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    const fetchFn = stubFetch(hanging);
    const v = mount(props);
    await act(async () => {
      fireEvent.submit(v.form());
      await settle();
    });
    expect(v.submit().disabled).toBe(true);
    expect(v.submit().getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_SUBMIT_TIMEOUT_MS);
      await settle();
    });
    expect(v.submit().textContent).toContain("نتأكد من طلبك…");
    expect(v.submit().disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_SUBMIT_TIMEOUT_MS);
      await settle();
    });
    const keys = orderKeys(fetchFn);
    expect(keys).toHaveLength(2);
    expect(keys[0]?.length).toBeGreaterThanOrEqual(8);
    expect(keys[1]).toBe(keys[0]);
    const fallback = v.view.container.querySelector<HTMLAnchorElement>("[data-wa-fallback]");
    expect(fallback?.getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    expect(fallback?.textContent).toContain("ابعث نفس الطلب بالواتساب");
    expect(v.submit().disabled).toBe(false);
    // The key survives in the draft: a reload and a tap replays this order.
    expect(readOrderDraft(TENANT, PRODUCT)?.idempotencyKey).toBe(keys[0]);
  });

  it("clears the draft once the order is placed", async () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    stubFetch(async () => json(200, { success: true, orderNumber: "SH-0001", orderId: "order-1", total: 23000 }));
    const v = mount(props);
    await act(async () => {
      fireEvent.submit(v.form());
    });
    await waitFor(() =>
      expect(window.sessionStorage.getItem(orderDraftKey(TENANT, PRODUCT))).toBeNull(),
    );
    const stash = JSON.parse(window.sessionStorage.getItem("schn:last-order") ?? "{}") as { number?: string };
    expect(stash.number).toBe("SH-0001");
  });

  it("says the order is already in on a duplicate — no Purchase, no thank-you page", async () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    stubFetch(async () => json(200, { success: true, replayed: true, duplicate: true }));
    const v = mount(props);
    await act(async () => {
      fireEvent.submit(v.form());
    });
    await waitFor(() =>
      expect(v.view.container.textContent).toContain("طلبك واصلنا، لا تطلبه مرة ثانية"),
    );
    expect(fbqMock().mock.calls.some((c) => c[1] === "Purchase")).toBe(false);
    expect(window.sessionStorage.getItem("schn:last-order")).toBeNull();
    expect(window.sessionStorage.getItem(orderDraftKey(TENANT, PRODUCT))).toBeNull();
  });
});
