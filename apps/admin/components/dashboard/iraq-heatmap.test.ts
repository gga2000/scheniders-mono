// The Home map named no window and left out every order it could not place,
// so it looked complete when a quarter of sales were missing.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IraqHeatmap } from "./iraq-heatmap";

const render = (unknown: { orderCount: number; revenue: number }) =>
  renderToStaticMarkup(
    createElement(IraqHeatmap, {
      geoStats: { governorates: [{ governorateCode: "BGD", orderCount: 355, revenue: 10_000_000 }], unknown },
    }),
  );

describe("IraqHeatmap", () => {
  it("names its window", () => {
    expect(render({ orderCount: 0, revenue: 0 })).toContain("Geographic Distribution, last 90 days");
  });

  it("says how many orders it could not place", () => {
    expect(render({ orderCount: 30, revenue: 1_050_500 })).toMatch(/Unknown city: 30 orders, 1,050,500 IQD shop sales/);
  });

  it("has no unknown line when every order is placed", () => {
    expect(render({ orderCount: 0, revenue: 0 })).not.toContain("Unknown city");
  });
});
