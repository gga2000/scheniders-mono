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
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "/s/acme", children: null },
      React.createElement(order_confirmation.render, {
        props: { ...order_confirmation.defaultProps, ...props },
        ctx: {
          tenant: tenant as never,
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
