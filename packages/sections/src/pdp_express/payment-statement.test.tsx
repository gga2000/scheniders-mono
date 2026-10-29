// @vitest-environment jsdom
// Express `payment_tag: "statement"` (spec §1.2): the payment method is a
// plain statement, «الدفع: كاش عند الاستلام» — no chevron, no panel, and
// the merchant's "soon" methods are not shown. Absent keeps today's tag
// that opens the methods panel (pinned by the express baselines).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { OrderLine } from "./order-line";

afterEach(cleanup);

function line(paymentTag: "menu" | "statement" | undefined, locale: LocaleCode = "ar") {
  return (
    <OrderLine
      locale={locale}
      qty={1}
      setQty={() => undefined}
      maxQty={10}
      atMinQty
      atMaxQty={false}
      decreaseLabel="-"
      increaseLabel="+"
      soon={["qi_card", "zain_cash"]}
      idBase="t"
      paymentTag={paymentTag}
    />
  );
}

describe("OrderLine paymentTag", () => {
  it("statement: plain text, no payment control, no soon methods", () => {
    const html = renderToStaticMarkup(line("statement"));
    expect(html).toContain("data-payment-statement");
    expect(html).toContain("الدفع: كاش عند الاستلام");
    expect(html).not.toContain('aria-controls="t-pay-panel"');
    expect(html).toContain('aria-controls="t-qty-panel"');
  });

  it("statement in english", () => {
    expect(renderToStaticMarkup(line("statement", "en"))).toContain("Payment: Cash on delivery");
  });

  it("statement: tapping the row never shows the soon methods", () => {
    render(line("statement"));
    fireEvent.click(screen.getByText("الدفع: كاش عند الاستلام"));
    expect(screen.queryByText("زين كاش")).toBeNull();
  });

  it("absent: the payment tag still opens the methods panel", () => {
    expect(renderToStaticMarkup(line(undefined))).toBe(renderToStaticMarkup(line("menu")));
    render(line(undefined));
    fireEvent.click(screen.getByRole("button", { name: /كاش عند الاستلام/ }));
    expect(screen.getByText("زين كاش")).toBeTruthy();
  });
});
