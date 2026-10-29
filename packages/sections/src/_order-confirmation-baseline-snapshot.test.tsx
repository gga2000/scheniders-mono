// =====================================================================
// P5 T0 — order_confirmation default markup, frozen
// =====================================================================
// The thank-you call card is opt-in (`show_call_card`). Every store that
// has not turned it on must render byte-identical markup through P5, so
// these server-markup snapshots pin the section as it is on main. A diff
// here is a back-compat break, not a snapshot to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import order_confirmation from "./order_confirmation";

const runtime = {
  page_id: "checkout_success" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-10-21T00:00:00Z"),
};

const tenant = {
  id: "tenant-1",
  business_name: "متجر",
  store_config: {
    contact: { whatsapp_number: "07701234567", phone_number: "07779703832" },
  },
};

function render(
  locale: "ar" | "en" | "ku",
  orderNumber: string | undefined,
  props: Partial<typeof order_confirmation.defaultProps> = {},
  tenantRow: object = tenant,
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "/s/acme", children: null },
      React.createElement(order_confirmation.render, {
        props: { ...order_confirmation.defaultProps, ...props },
        ctx: {
          tenant: tenantRow as never,
          runtime: {
            ...runtime,
            locale,
            ...(orderNumber ? { order_number: orderNumber } : {}),
          },
          products: [],
          categories: [],
        },
      }),
    ),
  );
}

describe("order_confirmation default markup (frozen)", () => {
  it.each([
    ["ar", "SH-0001"],
    ["en", "SH-0001"],
    ["ku", "SH-0001"],
    ["ar", undefined],
  ] as const)("%s, order %s", (locale, order) => {
    expect(render(locale, order)).toMatchSnapshot();
  });

  it("with a merchant-authored ETA", () => {
    expect(
      render("ar", "SH-0001", {
        eta_i18n: { ar: "خلال ٢٤ ساعة من تثبيت الطلب", en: "Within 24 hours" },
      }),
    ).toMatchSnapshot();
  });
});

// PDP redesign 1a moves the vCard contact name into helpers/vcard.ts and
// lets `commerce.contact.name_i18n` override it. With no name_i18n the
// thank-you call card — the vCard link and its download name included —
// must render exactly as below.
describe("order_confirmation call card markup (frozen)", () => {
  const contactTenant = {
    ...tenant,
    store_config_v2: {
      commerce: { contact: { call_number: "07801234567", whatsapp_confirm: true } },
    },
  };

  it.each(["ar", "en", "ku"] as const)("%s, store phone number", (locale) => {
    expect(render(locale, "SH-0001", { show_call_card: true })).toMatchSnapshot();
  });

  it("ar, commerce.contact call number", () => {
    expect(
      render("ar", "SH-0001", { show_call_card: true }, contactTenant),
    ).toMatchSnapshot();
  });
});
