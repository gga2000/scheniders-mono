// @vitest-environment jsdom
// =====================================================================
// PDP redesign 1b — the promise band in the browser
// =====================================================================
// A failed submit's message stays directly under «ثبّت طلبي», above the
// band. «احفظ رقمنا»: iPhone follows the vCard link and is told what to
// expect; Android shares the contact file; elsewhere the number is copied
// and the confirmation appears only once the clipboard has resolved. No
// message ever says the contact was saved.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { StoreContactConfig } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import { writeOrderDraft } from "./helpers/order-draft";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant, plainProduct, productCtx } from "./_pdp-fixtures";
import type { Tenant } from "./types";

const CONTACT: StoreContactConfig = {
  call_number: "07779703832",
  whatsapp_confirm: false,
  name_i18n: { ar: "شنايدر" },
};
const TENANT: Tenant = {
  ...fixtureTenant,
  store_config_v2: {
    commerce: { contact: CONTACT, shipping: { default_rate: { fee_iqd: 0 } } },
    enabled_locales: ["ar"],
  },
};
const BAND: Props = { ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, promise_layout: "band" };

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

function mount() {
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render props={BAND} ctx={productCtx(plainProduct, { tenant: TENANT })} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return { view, q };
}

function setNavigator(over: Record<string, unknown>) {
  for (const [key, value] of Object.entries(over)) {
    Object.defineProperty(window.navigator, key, { value, configurable: true });
  }
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ["userAgent", "maxTouchPoints", "share", "canShare", "clipboard"]) {
    Reflect.deleteProperty(window.navigator, key);
  }
});

describe("promise band — status messages stay under the submit", () => {
  it("a failed submit's message renders before the band", async () => {
    writeOrderDraft(fixtureTenant.id, plainProduct.id, {
      form: {
        customer_name: "زبون تجريبي",
        phone: "07802301677",
        alt_phone: "",
        governorate_code: "BG",
        address_details: "الكرادة قرب الجسر",
      },
      idempotencyKey: null,
      purchaseEventId: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { q } = mount();
    await act(async () => {
      fireEvent.submit(q<HTMLFormElement>("form#direct-order"));
    });
    const alert = await waitFor(() => q<HTMLElement>('[role="alert"]'));
    const band = q<HTMLElement>("[data-promise-band]");
    const submit = q<HTMLButtonElement>('button[type="submit"]');
    expect(submit.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("«احفظ رقمنا»", () => {
  it("iPhone: the vCard link navigates and the hint says what to expect", () => {
    setNavigator({ userAgent: IPHONE, maxTouchPoints: 5 });
    const { q } = mount();
    const pill = q<HTMLAnchorElement>("[data-save-number]");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      pill.dispatchEvent(click);
    });
    expect(click.defaultPrevented).toBe(false);
    expect(q("[data-save-hint]").textContent).toBe(
      "احفظه باسم «شنايدر — تأكيد الطلبات» من الشاشة اللي انفتحت — إذا ما انفتحت، احفظ الرقم يدوياً",
    );
  });

  it("Android: shares the contact file", async () => {
    const share = vi.fn(() => Promise.resolve());
    setNavigator({ userAgent: ANDROID, maxTouchPoints: 5, share, canShare: () => true });
    const { q } = mount();
    await act(async () => {
      fireEvent.click(q("[data-save-number]"));
    });
    expect(share).toHaveBeenCalledTimes(1);
    const [data] = share.mock.calls[0] as unknown as [{ files: File[]; title: string }];
    expect(data.files[0].name).toBe("شنايدر — تأكيد الطلبات.vcf");
    expect(data.files[0].type).toBe("text/vcard");
    await waitFor(() =>
      expect(q("[data-save-hint]").textContent).toContain("احفظه باسم «شنايدر — تأكيد الطلبات»"),
    );
  });

  it("desktop: copies, and confirms only after the clipboard resolves", async () => {
    let resolveWrite: () => void = () => undefined;
    const writeText = vi.fn(() => new Promise<void>((r) => (resolveWrite = r)));
    setNavigator({ userAgent: WINDOWS, maxTouchPoints: 0, clipboard: { writeText } });
    const { q } = mount();
    await act(async () => {
      fireEvent.click(q("[data-save-number]"));
    });
    expect(writeText).toHaveBeenCalledWith("0777 970 3832");
    expect(q("[data-save-hint]").textContent).toBe("");
    await act(async () => {
      resolveWrite();
    });
    expect(q("[data-save-hint]").textContent).toBe("نسخنا الرقم — احفظه باسم «شنايدر — تأكيد الطلبات»");
  });

  it("desktop: a refused clipboard asks for the number by hand", async () => {
    const writeText = vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    setNavigator({ userAgent: WINDOWS, maxTouchPoints: 0, clipboard: { writeText } });
    const { q } = mount();
    await act(async () => {
      fireEvent.click(q("[data-save-number]"));
    });
    await waitFor(() =>
      expect(q("[data-save-hint]").textContent).toBe("احفظ الرقم يدوياً باسم «شنايدر — تأكيد الطلبات»"),
    );
  });

  it("no hint ever claims the contact was saved", () => {
    const { q } = mount();
    expect(q("[data-promise-band]").textContent).not.toContain("انحفظ");
  });
});
