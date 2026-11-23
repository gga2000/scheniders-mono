// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Lead } from "@/types/leads";

const read = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/hooks/use-infinite-leads", () => ({ useInfiniteLeads: () => read.current }));
vi.mock("@/hooks/use-lead-analytics", () => ({ useLeadAnalytics: () => ({ data: undefined }) }));
vi.mock("@/hooks/use-lead-mutations", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteLead: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));
vi.mock("../use-resumed-draft", () => ({ useResumedDraft: () => ({ resume: vi.fn(), formKey: "none", form: {} }) }));
vi.mock("./lead-mobile-row", () => ({
  LeadMobileRow: ({ lead }: { lead: Lead }) => createElement("p", null, lead.merchant_name),
}));
vi.mock("./lead-register-sheet", () => ({ LeadRegisterSheet: () => null }));
vi.mock("./advance-stage-sheet", () => ({ AdvanceStageSheet: () => null }));

import { LeadsMobileView } from "./leads-mobile-view";

/*
 * Round 24 (structure new 2): the phone's lead list swapped the leads it
 * showed for "Failed to load leads" on one failed re-read or "Load more".
 * It now keeps them, says how old they are, and shows the error only when
 * the list was never read.
 */
const lead = { id: "lead-1", merchant_name: "Kawkab", status: "new" } as unknown as Lead;
const pages = { pages: [{ leads: [lead], total: 2, readAt: Date.parse("2026-11-22T17:00:00Z") }] };

function show(state: Record<string, unknown>) {
  read.current = {
    data: undefined,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isRefetchError: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    // Read at 20:00 in Baghdad.
    dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
    ...state,
  };
  return render(createElement(LeadsMobileView));
}

afterEach(cleanup);

describe("the phone's lead list", () => {
  it("keeps its leads and says how old they are when a re-read fails", () => {
    show({ data: pages, isError: true, isRefetchError: true, error: new Error("Failed to fetch leads") });

    expect(screen.getByText("Kawkab")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(
      /^Could not refresh the leads\. This list is from (Sun 22 Nov, )?20:00\./,
    );
  });

  it("keeps its leads, and offers Try again in place of Load more, when the next page fails", () => {
    show({ data: pages, hasNextPage: true, isError: true, isFetchNextPageError: true, error: new Error("Failed to fetch leads") });

    expect(screen.getByText("Kawkab")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/^Could not load more leads\./);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows the error only when the list was never read", () => {
    show({ isError: true, error: new Error("Failed to fetch leads") });

    expect(screen.queryByText("Kawkab")).toBeNull();
    expect(screen.getByText(/Could not load the leads/)).toBeTruthy();
  });
});
