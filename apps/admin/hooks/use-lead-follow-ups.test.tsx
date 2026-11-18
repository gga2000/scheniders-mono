// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Round 16 (Data new 2): a follow-up or a note refused because a colleague
 * deleted the lead left the page showing the lead. A refusal now reads the
 * lead again, so the page shows its "deleted" state.
 */
const LEAD_GONE = "This lead was deleted. Changes here can no longer be saved.";
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: async () => new Response(JSON.stringify({ error: LEAD_GONE }), { status: 404 }),
}));

const { useCreateFollowUp, useCompleteFollowUp } = await import("./use-lead-follow-ups");
const { useCreateActivity } = await import("./use-lead-activities");

afterEach(cleanup);

function withClient() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidated = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { invalidated, wrapper };
}

describe("a refused follow-up or note on a deleted lead", () => {
  it("reads the lead again and shows the refusal in staff words", async () => {
    const cases = [
      { hook: useCreateFollowUp, vars: { leadId: "lead-1", scheduled_at: "2026-11-20T07:00:00.000Z", title: "Call" } },
      { hook: useCompleteFollowUp, vars: { leadId: "lead-1", followUpId: "f-1" } },
      { hook: useCreateActivity, vars: { leadId: "lead-1", activity_type: "note" as const, title: "Note" } },
    ];
    for (const { hook, vars } of cases) {
      const { invalidated, wrapper } = withClient();
      const { result } = renderHook(() => hook(), { wrapper });
      let refused: unknown;
      await act(async () => {
        // Each hook takes its own variables; the cases pair them.
        await (result.current.mutateAsync as (v: typeof vars) => Promise<unknown>)(vars).catch((error: unknown) => {
          refused = error;
        });
      });
      expect(refused).toEqual(new Error(LEAD_GONE));
      expect(invalidated).toHaveBeenCalledWith({ queryKey: ["lead", "lead-1"] });
    }
  });
});
