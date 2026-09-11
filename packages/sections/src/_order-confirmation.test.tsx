// order_confirmation (Phase 3F / P0-4) — static-markup guarantees: the
// order number renders from the runtime, the ETA is hidden unless the
// merchant authors one, and the WhatsApp CTA carries the tenant number
// with the order prefilled (or disappears when no number is configured).

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";

import order_confirmation from "./order_confirmation";
import { resolveGreeting } from "./order_confirmation.client";
import type { SectionRenderContext } from "./_types";

const runtime = {
  page_id: "checkout_success" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-07T00:00:00Z"),
};

const tenant = {
  id: "tenant-1",
  business_name: "متجر",
  store_config: { contact: { whatsapp_number: "07701234567" } },
};

function render(
  props: Partial<typeof order_confirmation.defaultProps> = {},
  ctx: Partial<SectionRenderContext> = {},
  base = "",
): string {
  const Render = order_confirmation.render;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base, children: null },
      React.createElement(Render, {
        props: { ...order_confirmation.defaultProps, ...props },
        ctx: {
          tenant: tenant as never,
          runtime,
          products: [],
          categories: [],
          ...ctx,
        },
      }),
    ),
  );
}

describe("order_confirmation", () => {
  it("is registered for the thank-you page only", () => {
    expect(order_confirmation.valid_on).toEqual(["checkout_success"]);
    expect(
      order_confirmation.schema.safeParse(order_confirmation.defaultProps)
        .success,
    ).toBe(true);
  });

  it("renders the order number from the runtime in a copyable <code>", () => {
    const html = render(
      {},
      { runtime: { ...runtime, order_number: "SCH-1042" } },
    );
    expect(html).toMatch(/<code[^>]*tabular-nums[^>]*>SCH-1042<\/code>/);
    expect(html).toContain("رقم الطلب");
    expect(html).toContain("<h1");
    expect(html).toContain("تم استلام طلبك");
    // Neutral promise — no invented minutes.
    expect(html).toContain("سنتصل بك لتأكيد الطلب والعنوان قبل الشحن.");
    expect(html).not.toMatch(/دقيقة/);
    // Three default steps.
    expect((html.match(/<li\b/g) ?? []).length).toBe(3);
  });

  it("omits the order block on the server when no order number is known", () => {
    const html = render();
    expect(html).not.toContain("<code");
    expect(html).not.toContain("رقم الطلب");
    // Track link still works without a number.
    expect(html).toContain('href="/track"');
  });

  it("hides the ETA unless the merchant sets one — never a fabricated date", () => {
    const without = render();
    expect(without).not.toContain("موعد التوصيل المتوقع");
    const withEta = render({
      eta_i18n: { ar: "٢–٤ أيام عمل", en: "2–4 business days" },
    });
    expect(withEta).toContain("موعد التوصيل المتوقع");
    expect(withEta).toContain("٢–٤ أيام عمل");
  });

  it("links WhatsApp to the tenant number with the order prefilled", () => {
    const html = render(
      {},
      { runtime: { ...runtime, order_number: "SCH-1042" } },
    );
    const wa = html.match(/href="(https:\/\/wa\.me\/[^"]+)"/);
    expect(wa).not.toBeNull();
    const href = (wa as RegExpMatchArray)[1].replace(/&amp;/g, "&");
    expect(href.startsWith("https://wa.me/9647701234567?text=")).toBe(true);
    const text = decodeURIComponent(href.split("text=")[1]);
    expect(text).toBe("مرحباً! عندي استفسار عن طلبي رقم SCH-1042");
    expect(html).toContain("تواصل معنا عبر واتساب");
  });

  it("drops the {order} token from the WhatsApp text when no number is known", () => {
    const html = render();
    const wa = html.match(/href="(https:\/\/wa\.me\/[^"]+)"/);
    const href = (wa as RegExpMatchArray)[1].replace(/&amp;/g, "&");
    expect(decodeURIComponent(href.split("text=")[1])).toBe(
      "مرحباً! عندي استفسار عن طلبي رقم",
    );
  });

  it("renders no WhatsApp CTA when the tenant has no plausible number", () => {
    const html = render(
      {},
      {
        tenant: {
          id: "t",
          business_name: "x",
          store_config: { contact: {} },
        } as never,
      },
    );
    expect(html).not.toContain("wa.me");
    expect(html).toContain("تتبّع طلبك");
  });

  it("prefixes store links with the base path and encodes the order in the track link", () => {
    const html = render(
      {},
      { runtime: { ...runtime, order_number: "#1042" } },
      "/s/acme",
    );
    expect(html).toContain('href="/s/acme/track?order=%231042"');
    expect(html).toContain('href="/s/acme/products"');
  });

  it("falls back to English copy for the en locale and Arabic for ku", () => {
    const en = render(
      {},
      { runtime: { ...runtime, locale: "en", order_number: "A1" } },
    );
    expect(en).toContain("Order received");
    expect(en).toContain("What happens next");
    const ku = render(
      {},
      { runtime: { ...runtime, locale: "ku", order_number: "A1" } },
    );
    expect(ku).toContain("تم استلام طلبك");
  });

  it("uses brand tokens, never the Candy palette", () => {
    const html = render({}, { runtime: { ...runtime, order_number: "A1" } });
    expect(html).toContain("var(--bk-surface-alt");
    expect(html).toContain("var(--bk-primary");
    expect(html).not.toMatch(/bg-candy-/);
  });

  it("keeps the generic heading on the server (the name only ever comes from the client stash)", () => {
    const html = render({}, { runtime: { ...runtime, order_number: "A1" } });
    expect(html).toContain("شكراً لك على طلبك");
    expect(html).not.toContain("{name}");
  });

  it("parses heading_named_i18n with its default so stored configs without it still load", () => {
    const parsed = order_confirmation.schema.safeParse({
      ...order_confirmation.defaultProps,
      heading_named_i18n: undefined,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.heading_named_i18n).toEqual({
        ar: "شكراً {name}",
        en: "Thanks, {name}",
      });
    }
  });
});

describe("resolveGreeting", () => {
  const props = order_confirmation.defaultProps;

  it("greets by name when the stash carries one", () => {
    expect(resolveGreeting(props, "ar", "علي")).toBe("شكراً علي");
    expect(resolveGreeting(props, "en", "Ali")).toBe("Thanks, Ali");
    expect(resolveGreeting(props, "ku", "علي")).toBe("شكراً علي");
  });

  it("falls back to the generic heading without a name (or a blank one)", () => {
    expect(resolveGreeting(props, "ar")).toBe("شكراً لك على طلبك");
    expect(resolveGreeting(props, "ar", "   ")).toBe("شكراً لك على طلبك");
    expect(resolveGreeting(props, "en", "")).toBe("Thank you for your order");
  });

  it("uses the generic heading when the merchant's named copy drops the {name} token", () => {
    expect(
      resolveGreeting(
        { ...props, heading_named_i18n: { ar: "شكراً!", en: "Thanks!" } },
        "ar",
        "علي",
      ),
    ).toBe("شكراً لك على طلبك");
  });

  it("trims the name and resolves merchant copy per locale", () => {
    expect(
      resolveGreeting(
        {
          ...props,
          heading_named_i18n: { ar: "أهلاً {name}، وصل طلبك", en: "Hi {name}" },
        },
        "en",
        "  Sara ",
      ),
    ).toBe("Hi Sara");
  });
});
