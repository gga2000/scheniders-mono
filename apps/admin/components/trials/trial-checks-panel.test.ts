import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoadFailure } from "@/lib/load-failure";

/*
 * The one-trial card sits above the Trials list. When its read failed, it drew
 * the full-page error (60% of the screen high) saying "No numbers are shown",
 * above a trial list and an "Ends today" row that had loaded fine.
 */

let query: { data: unknown; isLoading: boolean; isError: boolean; error: unknown; isFetching: boolean; refetch: () => void };
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

  it("shows nothing while there is nothing flagged", () => {
    query = {
      data: { checks: [], summary: { needs_look: 0, no_trial: 0, review: 0 } },
      isLoading: false, isError: false, error: null, isFetching: false, refetch: () => {},
    };
    expect(render()).toBe("");
  });
});
