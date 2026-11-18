// The Map and Pipeline views counted the pages of the list loaded so far (50
// shops a page), so at 5,000 shops the map said "50 total" and the Pipeline's
// Trial column said 31 when there were 900. Their numbers now come from the
// stats route, which counts every shop that matches the filters.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { MerchantsStats } from "@/hooks/use-merchants-stats";
import type { AdminTenant } from "@/types/admin";

const stats: MerchantsStats = {
  total: 5000,
  total_wallet_iqd: 43_800_000,
  plan_prices_iqd: 9_000_000,
  fees_30d_iqd: 1_105_500,
  status: { trial: 900, active: 3800, limited: 20, suspended: 180, cancelled: 100 },
  on_trial: 905,
  buckets: { trials_today: 4, trials_expired: 2, suspended: 180, cancelled: 100, low_wallet: 40, attention: 230 },
  governorates: { BGD: 2100, BAS: 640 },
  unknown_city: 1250,
};
vi.mock("@/hooks/use-merchants-stats", () => ({ useMerchantsStats: () => ({ data: stats, isError: false }) }));
// The Pipeline lets a card move only for a role with change_plan.
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));

const { MerchantsMapView } = await import("./merchants-map-view");
const { MerchantsKanbanView } = await import("./merchants-kanban-view");

const shop = (n: number, status: AdminTenant["status"]) =>
  ({
    id: `shop-${n}`,
    business_name: `Shop ${n}`,
    slug: `shop-${n}`,
    status,
    plan: "starter",
    wallet: { balance_iqd: 20_000 },
    fees_30d: 0,
    branding: null,
  }) as unknown as AdminTenant;

const inQueryClient = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, element));

describe("MerchantsMapView", () => {
  const html = renderToStaticMarkup(createElement(MerchantsMapView));

  it("says how many shops match, not how many are loaded", () => {
    expect(html).toContain("5000 total");
    expect(html).toContain("1250 unmapped");
  });

  it("puts each governorate's count from the server on the map and in the list", () => {
    expect(html).toContain(">2100<");
    expect(html).toContain(">640<");
    expect(html).toMatch(/Baghdad<\/span><span[^>]*>2100/);
  });
});

describe("MerchantsKanbanView", () => {
  // Two trial shops and one active shop are loaded; the server counts 900 and 3,800.
  const html = inQueryClient(
    createElement(MerchantsKanbanView, { merchants: [shop(1, "trial"), shop(2, "trial"), shop(3, "active")] }),
  );

  it("heads each column with the server's count", () => {
    for (const count of ["900", "3,800", "20", "180", "100"]) expect(html).toContain(`>${count}</span>`);
  });

  it("says how many shops of a column are not loaded yet", () => {
    expect(html).toContain("898 more not loaded yet. Scroll down to load them.");
    expect(html).toContain("3,799 more not loaded yet.");
  });

  it("does not call a column empty while its shops are still to load", () => {
    // Paused, Suspended and Cancelled have shops on the server and none loaded.
    expect(html).not.toContain(">Empty<");
  });
});
