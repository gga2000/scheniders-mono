// @vitest-environment jsdom
// Round 4 (r4-10), open until round 17: picking a governorate on the Map said
// "List below filtered to Baghdad", but the Map view has no list below. The
// pick filters the other views, so the line names them.
import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MerchantsStats } from "@/hooks/use-merchants-stats";
import { useAdminStore } from "@/store/use-admin-store";

const stats: MerchantsStats = {
  total: 3,
  total_wallet_iqd: 0,
  plan_prices_iqd: 0,
  fees_30d_iqd: 0,
  status: { trial: 1, active: 2, limited: 0, suspended: 0, cancelled: 0 },
  on_trial: 1,
  buckets: { trials_today: 0, trials_expired: 0, suspended: 0, cancelled: 0, low_wallet: 0, attention: 0 },
  governorates: { BGD: 3 },
  unknown_city: 0,
};
vi.mock("@/hooks/use-merchants-stats", () => ({ useMerchantsStats: () => ({ data: stats, isError: false }) }));

const { MerchantsMapView } = await import("./merchants-map-view");

describe("MerchantsMapView with a governorate picked", () => {
  it("does not point at a list the Map does not have", () => {
    useAdminStore.getState().setCityFilter("baghdad");
    const html = render(createElement(MerchantsMapView)).container.textContent ?? "";
    expect(html).not.toContain("List below");
    expect(html).toContain("Cards, Table, Sheet and Pipeline now show only shops in Baghdad.");
  });
});
