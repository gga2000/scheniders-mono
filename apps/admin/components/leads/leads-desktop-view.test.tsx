// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Lead } from "@/types/leads";

const read = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const numbers = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-leads", () => ({ useLeads: () => read.current }));
vi.mock("@/hooks/use-lead-analytics", () => ({ useLeadAnalytics: () => numbers.current }));
vi.mock("@/hooks/use-leads-table-layout", () => ({ useLeadsTableLayout: () => ({ isPending: false }) }));
vi.mock("@/hooks/use-lead-mutations", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdateLead: () => ({ mutate: vi.fn() }),
  useDeleteLead: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role: "sales" }), useCan: () => () => true }));
vi.mock("@/components/leads/use-resumed-draft", () => ({
  useResumedDraft: () => ({ resume: vi.fn(), formKey: "none", form: {} }),
}));
vi.mock("@/components/leads/leads-table", () => ({
  LeadsTable: ({ leads }: { leads: Lead[] }) =>
    createElement("ul", null, ...leads.map((l) => createElement("li", { key: l.id }, l.merchant_name))),
}));
vi.mock("@/components/leads/lead-filter-bar", () => ({ LeadFilterBar: () => null }));
vi.mock("@/components/leads/lead-form", () => ({ LeadForm: () => null }));
vi.mock("@/components/leads/lead-bulk-bar", () => ({ LeadBulkBar: () => null }));
vi.mock("@/components/leads/lead-card", () => ({ LeadCard: () => null }));
vi.mock("@/components/leads/lead-kanban", () => ({ LeadKanban: () => null }));
vi.mock("@/components/leads/lead-import-dialog", () => ({ LeadImportDialog: () => null }));

import { LeadsDesktopView } from "./leads-desktop-view";

/*
 * Round 24 (structure new 2): the desk's lead list swapped the leads it
 * showed for "Failed to load leads" on one failed re-read. It now keeps
 * them, says how old they are, and shows the error only when the page of
 * leads was never read.
 */
const lead = { id: "lead-1", merchant_name: "Kawkab", status: "new" } as unknown as Lead;

const aRead = (state: Record<string, unknown>) => ({
  data: undefined,
  isRefetchError: false,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  isFetching: false,
  // Read at 20:00 in Baghdad.
  dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
  ...state,
});

function show(state: Record<string, unknown>, numbersState: Record<string, unknown> = {}) {
  read.current = aRead(state);
  numbers.current = aRead(numbersState);
  return render(createElement(LeadsDesktopView));
}

afterEach(cleanup);

describe("the desk's lead list", () => {
  it("keeps its leads and says how old they are when a re-read fails", () => {
    show({ data: { leads: [lead], total: 1 }, isError: true, isRefetchError: true, error: new Error("Failed to fetch leads") });

    expect(screen.getByText("Kawkab")).toBeTruthy();
    expect(screen.getByText(/^Could not refresh the leads\. This list is from (Sun 22 Nov, )?20:00\./)).toBeTruthy();
    expect(screen.queryByText(/Could not load the leads/)).toBeNull();
  });

  it("shows the error only when the page of leads was never read", () => {
    show({ isError: true, error: new Error("Failed to fetch leads") });

    expect(screen.queryByText("Kawkab")).toBeNull();
    expect(screen.getByText(/Could not load the leads/)).toBeTruthy();
  });
});

/*
 * Round 25 (data new 3, structure new 1): the four lead numbers stayed on
 * screen with no word after a failed refresh, while the list under them said
 * it was old. They now say so with the same line.
 */
describe("the desk's lead numbers", () => {
  const analytics = { total_leads: 28, by_status: { new: 5 }, conversion_rate: 10, monthly_trends: [] };

  it("keep their numbers and say how old they are when a refresh fails", () => {
    show({ data: { leads: [lead], total: 1 } }, { data: analytics, isError: true, isRefetchError: true, error: new Error("Failed") });

    expect(screen.getByText("28")).toBeTruthy();
    expect(screen.getByText(/^Could not refresh the lead numbers\. These numbers are from (Sun 22 Nov, )?20:00\./)).toBeTruthy();
    expect(screen.queryByText(/Could not load the lead numbers/)).toBeNull();
  });

  it("show dashes and the error only when they were never read", () => {
    show({ data: { leads: [lead], total: 1 } }, { isError: true, error: new Error("Failed") });

    expect(screen.queryByText("28")).toBeNull();
    expect(screen.getByText(/^Could not load the lead numbers\./)).toBeTruthy();
    expect(screen.queryByText(/Could not refresh the lead numbers/)).toBeNull();
  });
});
