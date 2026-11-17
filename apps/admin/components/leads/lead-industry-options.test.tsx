// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/*
 * Round 10: deleting an industry that leads use switches it off, and those
 * leads keep it. But the Leads filter listed only industries that are on, so
 * those leads could not be found by industry; and the lead's edit form showed
 * "Select industry" for its own industry, as if it had none. The filter now
 * lists switched-off industries last, marked "(off)", and the form keeps the
 * lead's own one, marked, without offering other switched-off ones.
 */

const industry = (id: string, name: string, name_ar: string, is_active: boolean, sort_order: number) => ({
  id, name, name_ar, is_active, sort_order, icon: "Building2", color: "#6B7280", avg_order_value_iqd: 25000, created_at: "2026-11-17T00:00:00Z",
});
const LIST = [
  industry("i-fashion", "Fashion", "أزياء", true, 1),
  industry("i-toys", "Toys", "ألعاب", false, 2),
  industry("i-games", "Games", "أل", false, 3),
  industry("i-other", "Other", "أخرى", true, 99),
];
vi.mock("@/hooks/use-industries", () => ({
  useIndustries: () => ({ data: LIST, isError: false, refetch: vi.fn() }),
  useCreateIndustry: () => ({}),
  useUpdateIndustry: () => ({}),
  useMoveIndustry: () => ({}),
  useDeleteIndustry: () => ({}),
  IndustryGoneError: class extends Error {},
}));
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => false }));
vi.mock("./lead-industry-manager", () => ({ LeadIndustryManager: () => null }));

const { LeadFilterBar } = await import("./lead-filter-bar");
const { LeadForm } = await import("./lead-form");

const wrap = (node: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
/** The texts of the options in the box whose first option is `first`. */
const optionsOf = (first: string) => {
  const select = [...document.querySelectorAll("select")].find((s) => s.options[0]?.text === first);
  return select ? [...select.options].map((o) => o.text) : null;
};

afterEach(cleanup);

describe("industries that are switched off", () => {
  it("the Leads filter lists them last, marked, so their leads can still be found", () => {
    wrap(<LeadFilterBar />);

    expect(optionsOf("All Industries")).toEqual(["All Industries", "Fashion", "Other", "Toys (off)", "Games (off)"]);
  });

  it("a lead's edit form keeps the lead's own switched-off industry, and offers no other", () => {
    wrap(<LeadForm open onOpenChange={() => {}} onSubmit={vi.fn()} initialData={{ merchant_name: "Kawkab", industry_id: "i-toys" }} />);

    expect(optionsOf("Select industry")).toEqual(["Select industry", "أزياء", "ألعاب (off)", "أخرى"]);
    expect(screen.getByDisplayValue("ألعاب (off)")).toBeTruthy();
  });

  it("a new lead is offered only industries that are on", () => {
    wrap(<LeadForm open onOpenChange={() => {}} onSubmit={vi.fn()} />);

    expect(optionsOf("Select industry")).toEqual(["Select industry", "أزياء", "أخرى"]);
  });
});
