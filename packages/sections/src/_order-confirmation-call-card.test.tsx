// @vitest-environment jsdom
// P5 — the thank-you call card. Opt-in; off, the section is unchanged (the
// frozen markup lives in _order-confirmation-baseline-snapshot). On, it is
// the brief for the confirmation call: first-name greeting, order number,
// the store's call number (copy + vCard), the WhatsApp line only once the
// platform logged the send, the buyer's masked number with a fix link, and
// "add a second number" through the proof-gated contact route.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import order_confirmation from "./order_confirmation";
import type { Props } from "./order_confirmation";

const ORDER = "11111111-1111-4111-8111-111111111111";
const CONTACT_URL = `/api/checkout/orders/${ORDER}/contact`;
const PROOF = "v1.payload.sig";

const tenant = {
  id: "44444444-4444-4444-8444-444444444444",
  business_name: "متجر شنايدر",
  store_config: {
    contact: { whatsapp_number: "07701234567", phone_number: "07779703832" },
  },
};

const runtime = (locale: LocaleCode) => ({
  page_id: "checkout_success" as const,
  breakpoint: "mobile" as const,
  locale,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-10-21T00:00:00Z"),
  order_number: "SH-0001",
});

function stash(over: Record<string, unknown> = {}): void {
  window.sessionStorage.setItem(
    "schn:last-order",
    JSON.stringify({
      number: "SH-0001",
      order_id: ORDER,
      upsell_token: PROOF,
      customer_name: "علي حسن",
      items: [],
      total: 1000,
      ts: Date.now(),
      ...over,
    }),
  );
}

function mount(
  props: Partial<Props> = {},
  locale: LocaleCode = "ar",
  tenantRow: object = tenant,
): void {
  render(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(order_confirmation.render, {
        props: { ...order_confirmation.defaultProps, show_call_card: true, ...props },
        ctx: { tenant: tenantRow as never, runtime: runtime(locale), products: [], categories: [] },
      }),
    ),
  );
}

/** A store that set P4's structured contact (call number + the WhatsApp
 *  flag the PDP line reads), as `toSectionTenant` forwards it. */
const tenantWithContact = {
  ...tenant,
  store_config_v2: {
    commerce: { contact: { call_number: "07801234567", whatsapp_confirm: true } },
    enabled_locales: ["ar", "en", "ku"],
  },
};

const contactState = (over: Record<string, unknown> = {}) => ({
  success: true,
  phone_masked: "0770 ••• 4567",
  has_backup: false,
  can_add_backup: true,
  whatsapp_sent: false,
  ...over,
});

interface Reply {
  status: number;
  body: unknown;
}
let contactReplies: Reply[] = [];
let postReplies: Reply[] = [];

/** A plain object, not a real Response: undici's body reader schedules on
 *  timers that the fake-timer tests freeze. */
const respond = (r: Reply) =>
  Promise.resolve({
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: () => Promise.resolve(r.body),
  } as unknown as Response);

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  if (url === CONTACT_URL && init?.method === "POST") {
    const r = postReplies.shift();
    if (!r) throw new Error("unexpected POST");
    return respond(r);
  }
  if (url === CONTACT_URL) {
    const r = contactReplies.length > 1 ? contactReplies.shift() : contactReplies[0];
    if (!r) throw new Error("unexpected GET");
    return respond(r);
  }
  return respond({ status: 404, body: null });
});

const contactGets = () =>
  fetchMock.mock.calls.filter(([url, init]) => url === CONTACT_URL && init?.method !== "POST").length;

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockClear();
  contactReplies = [{ status: 200, body: contactState() }];
  postReplies = [];
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("order_confirmation call card — opt-in", () => {
  it("is off unless the merchant turns it on: no card, no contact read", async () => {
    stash();
    await act(async () => {
      mount({ show_call_card: undefined });
    });
    expect(screen.queryByTestId("call-card")).toBeNull();
    expect(contactGets()).toBe(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("شكراً علي حسن");
  });

  it("degrades a malformed value to off", () => {
    const parsed = order_confirmation.schema.safeParse({
      ...order_confirmation.defaultProps,
      show_call_card: "yes",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.show_call_card).toBeUndefined();
  });
});

describe("order_confirmation call card — the brief", () => {
  it("greets by first name and shows the order number", async () => {
    stash();
    await act(async () => {
      mount();
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("تم يا علي، طلبك ثابت");
    expect(document.querySelector('[data-testid="call-card"] code')?.textContent).toBe("SH-0001");
  });

  it("lets the merchant reword the heading", async () => {
    stash();
    await act(async () => {
      mount({ call_card_heading_named_i18n: { ar: "وصلنا طلبك يا {name}" } });
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("وصلنا طلبك يا علي");
  });

  it("shows the store's call number with tap-to-call and a vCard to save it", async () => {
    stash();
    await act(async () => {
      mount();
    });
    const number = screen.getByTestId("call-card-number");
    expect(number.textContent).toBe("0777 970 3832");
    expect(number.getAttribute("href")).toBe("tel:+9647779703832");
    const save = screen.getByTestId("call-card-save");
    const href = save.getAttribute("href") ?? "";
    expect(href.startsWith("data:text/vcard;charset=utf-8,")).toBe(true);
    const card = decodeURIComponent(href.slice(href.indexOf(",") + 1));
    expect(card).toContain("FN:متجر شنايدر — تأكيد الطلبات");
    expect(card).toContain("TEL;TYPE=CELL,VOICE:+9647779703832");
    expect(save.getAttribute("download")).toBe("متجر شنايدر — تأكيد الطلبات.vcf");
  });

  it("shows no contact line for a store without commerce.contact", async () => {
    stash();
    await act(async () => {
      mount();
    });
    expect(screen.getByTestId("call-card-number").textContent).toBe("0777 970 3832");
    expect(document.querySelector("[data-contact-line]")).toBeNull();
  });

  it("takes the number and P4's contact line from commerce.contact, without promising the WhatsApp", async () => {
    stash();
    await act(async () => {
      mount({}, "ar", tenantWithContact);
    });
    const number = screen.getByTestId("call-card-number");
    expect(number.textContent).toBe("0780 123 4567");
    expect(number.getAttribute("href")).toBe("tel:+9647801234567");
    const save = screen.getByTestId("call-card-save").getAttribute("href") ?? "";
    expect(decodeURIComponent(save.slice(save.indexOf(",") + 1))).toContain(
      "TEL;TYPE=CELL,VOICE:+9647801234567",
    );
    const line = document.querySelector('[data-testid="call-card"] [data-contact-line]');
    expect(line?.getAttribute("data-contact-line")).toBe("channel");
    expect(line?.textContent).toContain("راح يوصلك اتصال من 0780 123 4567 لتأكيد طلبك");
    // The store sends the WhatsApp (whatsapp_confirm), but on this card it
    // is reported from the send log, never announced in advance.
    expect(line?.textContent).not.toContain("واتساب");
  });

  it("echoes the buyer's number masked, read with the checkout's proof, with a fix link", async () => {
    stash();
    await act(async () => {
      mount();
    });
    const call = fetchMock.mock.calls.find(([url]) => url === CONTACT_URL);
    expect(new Headers(call?.[1]?.headers).get("x-upsell-proof")).toBe(PROOF);
    expect(screen.getByTestId("call-card-your-number").textContent).toContain("0770 ••• 4567");
    const fix = screen.getByTestId("call-card-wrong-number");
    expect(fix.textContent).toBe("الرقم غلط؟ راسلنا");
    const fixHref = fix.getAttribute("href") ?? "";
    expect(fixHref.startsWith("https://wa.me/9647701234567?text=")).toBe(true);
    expect(decodeURIComponent(fixHref.split("text=")[1] ?? "")).toContain("SH-0001");
  });

  it("asks for nothing without a proof, and still shows who will call", async () => {
    stash({ upsell_token: undefined });
    await act(async () => {
      mount();
    });
    expect(contactGets()).toBe(0);
    expect(screen.getByTestId("call-card-number").textContent).toBe("0777 970 3832");
    expect(screen.queryByTestId("call-card-your-number")).toBeNull();
    expect(screen.queryByTestId("call-card-add-backup")).toBeNull();
  });

  it("speaks Kurdish for a ku visitor", async () => {
    stash();
    await act(async () => {
      mount({}, "ku");
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "تەواو علي، داواکارییەکەت تۆمارکرا",
    );
    expect(screen.getByTestId("call-card").textContent).toContain(
      "لەم ژمارەیەوە پەیوەندیت پێوە دەکەین",
    );
  });
});

describe("order_confirmation call card — the WhatsApp line", () => {
  it("appears only once the platform logged the send, then stops asking", async () => {
    vi.useFakeTimers();
    stash();
    contactReplies = [
      { status: 200, body: contactState({ whatsapp_sent: false }) },
      { status: 200, body: contactState({ whatsapp_sent: true }) },
    ];
    await act(async () => {
      mount();
    });
    expect(screen.queryByTestId("call-card-whatsapp")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(screen.getByTestId("call-card-whatsapp").textContent).toContain(
      "رسالة واتساب وصلتك هسه — اضغط تأكيد",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(contactGets()).toBe(2);
  });

  it("gives up after the last re-check when nothing was sent, and never claims it was", async () => {
    vi.useFakeTimers();
    stash();
    await act(async () => {
      mount();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(contactGets()).toBe(3);
    expect(screen.queryByTestId("call-card-whatsapp")).toBeNull();
  });
});

describe("order_confirmation call card — a second number", () => {
  async function openAndType(value: string): Promise<void> {
    fireEvent.click(screen.getByTestId("call-card-add-backup"));
    fireEvent.change(screen.getByLabelText("الرقم الثاني"), { target: { value } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId("call-card-backup-form"));
    });
  }

  it("adds it to THIS order with the checkout's proof", async () => {
    stash();
    postReplies = [{ status: 200, body: { success: true, has_backup: true } }];
    await act(async () => {
      mount();
    });
    await openAndType("0780 111 2222");
    const post = fetchMock.mock.calls.find(([url, init]) => url === CONTACT_URL && init?.method === "POST");
    expect(post).toBeTruthy();
    expect(new Headers(post?.[1]?.headers).get("x-upsell-proof")).toBe(PROOF);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ phone: "07801112222" });
    expect(screen.getByTestId("call-card-backup-saved").textContent).toBe("تم، نتصل عليه إذا ما رديت");
    expect(screen.queryByTestId("call-card-add-backup")).toBeNull();
  });

  it("refuses a number that is not an Iraqi mobile before sending anything", async () => {
    stash();
    await act(async () => {
      mount();
    });
    await openAndType("123");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(screen.getByTestId("call-card-backup-error").textContent).toBe(
      "اكتب رقم موبايل عراقي صحيح، مثل 0770 123 4567",
    );
  });

  it("explains when the server says it is the number they ordered with", async () => {
    stash();
    postReplies = [{ status: 422, body: { success: false, error: "same_as_primary" } }];
    await act(async () => {
      mount();
    });
    await openAndType("07701234567");
    expect(screen.getByTestId("call-card-backup-error").textContent).toBe(
      "هذا نفس رقمك الأول — اكتب رقم ثاني",
    );
  });

  it("points to WhatsApp once the order is no longer taking one", async () => {
    stash();
    postReplies = [{ status: 409, body: { success: false, error: "closed" } }];
    await act(async () => {
      mount();
    });
    await openAndType("07801112222");
    expect(screen.getByTestId("call-card-backup-error").textContent).toBe(
      "طلبك صار عند فريقنا — دز لنا الرقم على واتساب",
    );
  });

  it("offers a retry, not 'closed', when the order changed under the write", async () => {
    // P1's dispatch claim and the WhatsApp bot both update the order a few
    // seconds after it lands; the route answers that race with `changed`,
    // and a retry re-reads the row, so the buyer is told to try again.
    stash();
    postReplies = [{ status: 409, body: { success: false, error: "changed" } }];
    await act(async () => {
      mount();
    });
    await openAndType("07801112222");
    expect(screen.getByTestId("call-card-backup-error").textContent).toBe(
      "ما انحفظ الرقم، جرّب مرة ثانية",
    );
  });

  it("is not offered when the order already has one", async () => {
    stash();
    contactReplies = [{ status: 200, body: contactState({ has_backup: true, can_add_backup: false }) }];
    await act(async () => {
      mount();
    });
    expect(screen.queryByTestId("call-card-add-backup")).toBeNull();
  });
});
