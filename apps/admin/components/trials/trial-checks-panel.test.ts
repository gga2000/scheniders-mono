import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoadFailure } from "@/lib/load-failure";
import type { TrialCheck } from "@/lib/trial-checks";

/*
 * The one-trial card sits above the Trials list. When its read failed, it drew
 * the full-page error (60% of the screen high) saying "No numbers are shown",
 * above a trial list and an "Ends today" row that had loaded fine.
 */

let query: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  isRefetchError?: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => void;
  dataUpdatedAt?: number;
};
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => query,
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
}));

const { TrialChecksPanel } = await import("./trial-checks-panel");
const render = () => renderToStaticMarkup(createElement(TrialChecksPanel));

describe("the one-trial card", () => {
  it("keeps a failed read inside its own card, not over the page", () => {
    query = { data: undefined, isLoading: false, isError: true, error: new LoadFailure(500, "the one-trial checks"), isFetching: false, refetch: () => {} };
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load the one-trial checks");
    expect(html).toContain("pastel-card");
    expect(html).not.toContain("min-h-[60vh]");
  });

  // Round 23: a later read that failed kept the list with no word that it was old.
  it("says when it shows a list kept from an earlier read, and from when", () => {
    const kept = { checks: [], summary: { needs_look: 0, no_trial: 0, review: 0 } };
    query = {
      data: kept, isLoading: false, isError: true, isRefetchError: true, error: new LoadFailure(500, "the one-trial checks"),
      isFetching: false, refetch: () => {}, dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
    };
    const html = render();
    expect(html).toContain("Could not refresh the one-trial checks. This list is from");
    expect(html).toContain("One trial per merchant");
    expect(html).not.toContain("min-h-[60vh]");
    // Round 24: no store was ever flagged, so none "has a decision".
    expect(html).toContain("No store flagged.");
    expect(html).not.toContain("Every flagged store has a decision");
  });

  it("shows nothing while there is nothing flagged", () => {
    query = {
      data: { checks: [], summary: { needs_look: 0, no_trial: 0, review: 0 } },
      isLoading: false, isError: false, error: null, isFetching: false, refetch: () => {},
    };
    expect(render()).toBe("");
  });
});

describe("a flagged store that is paused", () => {
  const check = (status: string, restrictions: unknown): TrialCheck => ({
    tenant_id: "2b0f8f8e-6a43-4a34-9a5e-4d8a3c1f0a11",
    verdict: "review",
    trial_withheld_at: null,
    staff_decision: null,
    staff_reason: null,
    decided_by_email: null,
    decided_at: null,
    created_at: "2026-11-15T09:00:00Z",
    updated_at: "2026-11-15T09:00:00Z",
    store: {
      id: "2b0f8f8e-6a43-4a34-9a5e-4d8a3c1f0a11",
      business_name: "Noor",
      display_id: 100123,
      status,
      restrictions,
      trial_ends_at: "2026-11-20T09:00:00Z",
      contact_phone: null,
      created_at: "2026-11-15T09:00:00Z",
    },
    matches: [],
    needs_look: true,
  });
  const show = (one: TrialCheck) => {
    query = {
      data: { checks: [one], summary: { needs_look: 1, no_trial: 0, review: 1 } },
      isLoading: false, isError: false, error: null, isFetching: false, refetch: () => {},
    };
    return render();
  };

  it("says a paused trial is still a trial, with its end", () => {
    const html = show(check("limited", { status_before: "trial" }));
    expect(html).toContain("Paused, trial until");
    expect(html).not.toContain("Now limited");
  });

  it("calls any other pause paused, not limited", () => {
    const html = show(check("limited", { status_before: "active" }));
    expect(html).toContain("Now paused");
    expect(html).not.toContain("trial until");
  });
});
