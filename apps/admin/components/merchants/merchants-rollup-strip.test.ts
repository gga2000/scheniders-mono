import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MerchantsStats } from "@/hooks/use-merchants-stats";

/*
 * "MRR" here was the plan prices of the active shops, "MRR" on the map was our
 * fees from a city, and "MRR" on the shop pop-up was one plan price; "ARR" was
 * twelve times the first. Each number now says what it is.
 */

const stats: MerchantsStats = {
  total: 2,
  total_wallet_iqd: 43_800,
  plan_prices_iqd: 25_000,
  fees_30d_iqd: 11_055,
  status: { trial: 1, active: 1, suspended: 0, cancelled: 0 },
  buckets: { trials_today: 0, trials_expired: 0, suspended: 0, cancelled: 0, low_wallet: 1, attention: 1 },
};
vi.mock("@/hooks/use-merchants-stats", () => ({ useMerchantsStats: () => ({ data: stats }) }));

const { MerchantsRollupStrip } = await import("./merchants-rollup-strip");

describe("MerchantsRollupStrip", () => {
  const html = renderToStaticMarkup(createElement(MerchantsRollupStrip));

  it("names the plan prices of active shops and our fees for what they are", () => {
    expect(html).toContain("Plan prices");
    expect(html).toContain("active shops, a month");
    expect(html).toMatch(/25K<span[^>]*>IQD/);
    expect(html).toContain("Our fees");
    expect(html).toContain("last 30 days");
    expect(html).toMatch(/11K<span[^>]*>IQD/);
  });

  it("drops MRR, ARR and the year figure", () => {
    for (const word of ["MRR", "ARR", "/yr", "/mo", "Usage Charges", "300K"]) expect(html).not.toContain(word);
  });
});
