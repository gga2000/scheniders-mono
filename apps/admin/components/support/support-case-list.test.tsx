// @vitest-environment jsdom
// The change request tag in the inbox (round 23): it counted down in minutes
// ("Due in 22 h 59 min") and pushed the shop's name to nothing. It now reads
// in whole hours, and the name keeps a minimum width.
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SupportInboxRow } from "@/lib/support";

const NOW = Date.parse("2026-11-23T03:00:00Z");
vi.mock("@/hooks/use-live-tick", () => ({ useLiveTick: () => NOW }));

import { SupportCaseList } from "./support-case-list";

afterEach(cleanup);

function row(over: Partial<SupportInboxRow>): SupportInboxRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "33333333-3333-4333-8333-333333333333",
    opened_by_name: "Amal",
    status: "waiting_merchant",
    owner_admin_id: null,
    owner_name: "Noor",
    reason: null,
    first_reply_at: null,
    waiting_since: null,
    solved_at: null,
    rating: null,
    no_reason: null,
    reopened_count: 0,
    last_message_at: "2026-11-22T08:00:00Z",
    last_message_preview: "أريد فلتر حسب المحافظة",
    last_sender_kind: "staff",
    started_by: "merchant",
    created_at: "2026-11-22T08:00:00Z",
    tenants: { business_name: "A shop with a long name", display_id: 100095, plan: "starter", status: "active" },
    change_requested_at: "2026-11-22T08:00:00Z",
    ...over,
  };
}

function list(cases: SupportInboxRow[]) {
  render(<SupportCaseList cases={cases} selectedId={null} onSelect={() => undefined} isLoading={false} emptyLabel="none" />);
}

describe("the change request tag", () => {
  it("counts down in whole hours beside a name that keeps its width", () => {
    list([row({})]);
    const tag = screen.getByText("Change · 5 h");
    expect(tag.className).toContain("text-[var(--ink-amber)]");
    expect(tag.getAttribute("title")).toMatch(/^Change request: we promised it by .+, 11:00$/);
    expect(screen.getByText("A shop with a long name").className).toContain("min-w-[5rem]");
  });

  it("turns red once the promise is broken", () => {
    list([row({ change_requested_at: "2026-11-22T01:00:00Z" })]);
    expect(screen.getByText("Change · 2 h late").className).toContain("text-[var(--ink-red)]");
  });

  it("stops counting once solved, and shows nothing without a change request", () => {
    list([row({ status: "solved", change_requested_at: "2026-11-22T01:00:00Z" })]);
    expect(screen.getByText("Change").className).toContain("text-[var(--ink-amber)]");
    cleanup();
    list([row({ change_requested_at: null })]);
    expect(screen.queryByText(/^Change/)).toBeNull();
  });
});
