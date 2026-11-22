// @vitest-environment jsdom
// The lead page after a failed read again (staff console audit, round 13).
// A save refused over a colleague's lists reads the lead again; when that read
// failed, the page swapped the lead, and the form open on it with everything
// typed, for "Failed to load lead". The lead now stays, with a line that says
// the read failed and Try again; the error page is for a lead never read.
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

import { LeadDetailDesktop } from "./lead-detail-desktop";

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

const failed = Object.assign(new Error("Failed to load lead"), { status: 500 });

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
  return render(createElement(QueryClientProvider, { client }, createElement(LeadDetailDesktop)));
}

afterEach(cleanup);

describe("the lead page after a failed read again", () => {
  it("keeps the lead on screen and says the read failed, with Try again", () => {
    show({ data: { lead, activities: [], follow_ups: [], social_links: [], competitors: [] }, isError: true, error: failed });

    expect(screen.getByRole("heading", { name: "Kawkab" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/^Could not refresh this lead\. This page is from (Sun 22 Nov, )?20:00\./);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("Failed to load lead")).toBeNull();
  });

  // Round 14 (reliability new 2): a colleague deleted the lead while it was
  // open. Its read again answers 404, and "Try again" could never help.
  it("says the lead was deleted, with no Try again, when its read again finds it gone", () => {
    show({
      data: { lead, activities: [], follow_ups: [], social_links: [], competitors: [] },
      isError: true,
      error: new LoadFailure(404, "lead"),
    });

    expect(screen.getByRole("heading", { name: "Kawkab" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(
      /^This lead was deleted\. Changes here can no longer be saved\. This page is from (Sun 22 Nov, )?20:00\.$/,
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("link", { name: /Back to Leads/ })).toBeTruthy();
  });

  it("shows the error page only for a lead that was never read", () => {
    show({ data: undefined, isError: true, error: failed });

    expect(screen.getByText("Failed to load lead")).toBeTruthy();
  });

  it("says nothing extra while the lead reads fine", () => {
    show({ data: { lead, activities: [], follow_ups: [], social_links: [], competitors: [] } });

    expect(screen.queryByText(/Could not refresh/)).toBeNull();
  });
});

// Round 3 (r3-17): the lead page called the shop's estimated sales "Revenue
// Prediction ... potential revenue", which reads as money we would earn. Lead
// numbers calls the same figure "Est. monthly sales".
describe("the lead page's sales estimate", () => {
  it("says it is their sales, estimated, not our revenue", () => {
    show({ data: { lead: { ...lead, estimated_monthly_revenue: 1_200_000 }, activities: [], follow_ups: [], social_links: [], competitors: [] } });

    expect(screen.getByText("Their sales, estimated")).toBeTruthy();
    expect(screen.getByText("~1,200,000 IQD in sales a month")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/revenue/i);
  });
});
