import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeltaChip } from "@/components/shared/delta-chip";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";

/*
 * Board v6: a page's headline numbers sit in one white surface, each label
 * names its window, and a number still loading reads "..." (never a zero).
 */

const strip = (cells: ReturnType<typeof createElement>[]) =>
  renderToStaticMarkup(createElement(NumberStrip, { columns: 3, label: "Wallet numbers", children: cells }));

describe("NumberStrip", () => {
  it("puts every cell in one card, with the group named for screen readers", () => {
    const html = strip([
      createElement(NumberCell, { key: "a", label: "In wallets, now", value: "43,800 IQD" }),
      createElement(NumberCell, { key: "b", label: "Charged, all time", value: "..." }),
      createElement(NumberCell, { key: "c", label: "Added, all time", value: "129,000 IQD", note: "since sign-up" }),
    ]);
    expect(html.match(/pastel-card/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Wallet numbers"');
    expect(html).toContain("grid-cols-3");
    expect(html).toContain("In wallets, now");
    expect(html).toContain("43,800 IQD");
    expect(html).toContain("...");
    expect(html).toContain("since sign-up");
    expect(html).not.toMatch(/gradient/);
  });

  it("turns only an alert number red", () => {
    const calm = renderToStaticMarkup(createElement(NumberCell, { label: "Shops paused, now", value: "0" }));
    const alert = renderToStaticMarkup(createElement(NumberCell, { label: "Shops paused, now", value: "2", alert: true }));
    expect(calm).not.toContain("text-rose-700");
    expect(alert).toContain("text-rose-700");
  });
});

describe("DeltaChip", () => {
  it("writes the change with its sign and one decimal", () => {
    expect(renderToStaticMarkup(createElement(DeltaChip, { deltaPct: 12.46 }))).toContain("+12.5%");
    expect(renderToStaticMarkup(createElement(DeltaChip, { deltaPct: -96 }))).toContain("-96.0%");
    expect(renderToStaticMarkup(createElement(DeltaChip, { deltaPct: 0 }))).toContain("+0.0%");
  });

  it("shows nothing when there is no earlier number", () => {
    expect(renderToStaticMarkup(createElement(DeltaChip, { deltaPct: null }))).toBe("");
  });

  it("keeps light ink in dark mode", () => {
    const html = renderToStaticMarkup(createElement(DeltaChip, { deltaPct: -5 }));
    expect(html).toContain("text-rose-800");
    expect(html).toContain("dark:text-rose-300");
  });
});
