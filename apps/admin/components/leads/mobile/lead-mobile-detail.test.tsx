// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Lead } from "@/types/leads";
import { LoadFailure } from "@/lib/load-failure";

const read = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "lead-1" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-lead-detail", () => ({ useLeadDetail: () => read.current }));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: vi.fn(async () => new Response("[]")) }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ role: "super_admin", user: { id: "u1", email: "a@b.co" } }),
  useCan: () => () => true,
}));

import { LeadMobileDetail } from "./lead-mobile-detail";

/*
 * Round 16 (Structure new 8): the phone's lead page says a deleted lead was
 * deleted, as the desktop page does (round 14), with no test that held it.
 */
const lead = {
  id: "lead-1",
  merchant_name: "Kawkab",
  management_name: null,
  platform: "instagram",
  status: "new",
  priority: "medium",
  tier: "bronze",
  lead_score: 40,
  score_breakdown: null,
  follower_count: 1200,
  avg_like_count: 30,
  avg_comments_count: 4,
  avg_view_count: 0,
  avg_order_count: 0,
  estimated_daily_orders: 2,
  estimated_monthly_revenue: 0,
  created_at: "2026-11-10T09:00:00Z",
  phone_numbers: [],
  tags: [],
  branches: [],
} as unknown as Lead;

function show(state: Record<string, unknown>) {
  // Read at 20:00 in Baghdad (round 23: a failed read again says how old the page is).
  read.current = {
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
    ...state,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client }, createElement(LeadMobileDetail)));
}

afterEach(cleanup);

describe("the phone's lead page", () => {
  it("says the lead was deleted, with no Try again, when its read again finds it gone", () => {
    show({
      data: { lead, activities: [], follow_ups: [], social_links: [], competitors: [] },
      isError: true,
      error: new LoadFailure(404, "lead"),
    });

    expect(screen.getByText("Kawkab")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(
      /^This lead was deleted\. Changes here can no longer be saved\. This page is from (Sun 22 Nov, )?20:00\.$/,
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says a failed read again, with Try again, for any other failure", () => {
    show({
      data: { lead, activities: [], follow_ups: [], social_links: [], competitors: [] },
      isError: true,
      error: Object.assign(new Error("Failed to load lead"), { status: 500 }),
    });

    expect(screen.getByRole("alert").textContent).toMatch(/^Could not refresh this lead\. This page is from (Sun 22 Nov, )?20:00\./);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
