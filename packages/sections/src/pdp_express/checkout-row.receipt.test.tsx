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
  | "subtotal" | "referralAmount" | "pointsDiscount" | "delivery" | "total"
  | "shipping" | "oos" | "submitting" | "status" | "errorMsg" | "submitErrorId"
  | "waHref" | "reassurance" | "trustChips"
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
