// The express receipt must add up: every amount taken off the total is a
// line on the receipt. A friend's code arrives silently from a ?ref= link,
// so without its own line the total looked wrong by that amount.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import { CheckoutRow } from "./checkout-row";
import type { ExpressModel } from "./model";

/** Only the fields CheckoutRow reads; the rest of the model is irrelevant
 *  to the receipt and stays out of the fixture. */
type ReceiptFields = Pick<
  ExpressModel,
  | "props" | "product" | "locale" | "s" | "price" | "compareAt" | "qty"
  | "subtotal" | "referralAmount" | "pointsDiscount" | "pointsEarn" | "pointsRedeem" | "delivery" | "total"
  | "shipping" | "oos" | "submitting" | "status" | "errorMsg" | "submitErrorId"
  | "waHref" | "reassurance" | "trustChips" | "form"
>;

function receipt(fields: Partial<ReceiptFields>): string {
  const model: ReceiptFields = {
    props: { ...pdp_direct_order.defaultProps, layout: "express" },
    product: { id: "p1", name: "ويفر انتنس", price: 36750 } as ExpressModel["product"],
    locale: "ar",
    s: () => "",
    price: 36750,
    compareAt: null,
    qty: 1,
    subtotal: 36750,
    referralAmount: 0,
    pointsDiscount: 0,
    pointsEarn: null,
    pointsRedeem: null,
    delivery: 0,
    total: 36750,
    shipping: { default_rate: { fee_iqd: 0 } } as ExpressModel["shipping"],
    oos: false,
    submitting: false,
    status: "idle",
    errorMsg: null,
    submitErrorId: "err",
    waHref: null,
    reassurance: "",
    trustChips: [],
    form: { governorate_code: "" } as ExpressModel["form"],
    ...fields,
  };
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "" },
      React.createElement(CheckoutRow, {
        // CheckoutRow reads only ReceiptFields; the cast states that contract.
        m: model as unknown as ExpressModel,
        locale: "ar",
      }),
    ),
  );
}

describe("express receipt adds up", () => {
  it("lists the friend-code and points discounts that the total subtracts", () => {
    const html = receipt({ referralAmount: 3000, pointsDiscount: 1000, total: 32750 });
    expect(html).toContain("خصم رمز صديقك");
    expect(html).toContain("−3,000");
    expect(html).toContain("خصم نقاطك");
    expect(html).toContain("−1,000");
    expect(html).toContain("32,750");
  });

  it("shows no discount lines when nothing is taken off", () => {
    const html = receipt({});
    expect(html).not.toContain("خصم رمز صديقك");
    expect(html).not.toContain("خصم نقاطك");
  });
});

describe("expected arrival row", () => {
  it("is never in server markup, so a cached page cannot show a stale day", () => {
    const html = receipt({
      props: { ...pdp_direct_order.defaultProps, layout: "express", show_arrival_day: true },
      shipping: { default_rate: { fee_iqd: 0, eta_hours: 24 } } as ExpressModel["shipping"],
    });
    expect(html).not.toContain("data-arrival-day");
    expect(html).not.toContain("الوصول المتوقع");
  });
});

describe("gift row", () => {
  it("shows the gift the store sends, marked free, and nothing without one", () => {
    const html = receipt({
      props: { ...pdp_direct_order.defaultProps, layout: "express", receipt_gift_i18n: { ar: "تيستر هدية × 1" } },
    });
    expect(html).toContain("تيستر هدية × 1");
    expect(html).toMatch(/data-receipt-gift="" class="text-bk-success">مجاني</);
    expect(receipt({})).not.toContain("data-receipt-gift");
  });
});

describe("points earn line", () => {
  it("says what this order earns and what the points buy, after the total", () => {
    const html = receipt({ pointsEarn: { points: 347, per: 1000, value: 5000 }, subtotal: 34750, total: 34750 });
    expect(html).toContain("هذا الطلب يعطيك 347 نقطة");
    expect(html).toContain("تنضاف لما يوصلك الطلب. كل 1000 نقطة = خصم 5,000");
    expect(html.indexOf("data-points-earn")).toBeGreaterThan(html.indexOf("المجموع"));
  });

  it("is absent while the points programme is off", () => {
    expect(receipt({})).not.toContain("data-points-earn");
  });

  it("offers a quiet way in for earlier points once the phone is valid", () => {
    const html = receipt({
      pointsRedeem: { orderNumber: "", setOrderNumber: () => {}, balance: null, min: 1000, using: false, setUsing: () => {} },
    });
    expect(html).toContain("عندك نقاط من طلب سابق؟");
    expect(html).not.toContain("data-points-redeem");
  });
});
