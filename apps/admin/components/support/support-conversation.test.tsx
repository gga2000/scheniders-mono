// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupportCaseRow } from "@/lib/support";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const idle = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));
vi.mock("@/hooks/use-support-cases", () => ({
  useSupportCaseAction: idle,
  useSupportMarkSeen: idle,
  useSupportTeam: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-saved-replies", () => ({
  useSavedReplies: () => ({ data: [], isLoading: false, isError: false }),
  useAddSavedReply: idle,
  useChangeSavedReply: idle,
  useRemoveSavedReply: idle,
}));

import { SupportConversation } from "./support-conversation";

/*
 * Round 16 (Structure new 8): round 15 put the leave guard on the support
 * reply and staff note, with no test that holds it.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const supportCase = {
  id: "c1",
  tenant_id: "t1",
  opened_by_name: "Ali",
  status: "waiting_us",
  owner_admin_id: null,
  owner_name: null,
  reason: null,
  first_reply_at: null,
  waiting_since: "2026-11-18T00:00:00Z",
  solved_at: null,
  rating: null,
  no_reason: null,
  reopened_count: 0,
  last_message_at: "2026-11-18T00:00:00Z",
  last_message_preview: "مرحبا",
  last_sender_kind: "merchant",
  started_by: "merchant",
  created_at: "2026-11-18T00:00:00Z",
  tenants: null,
} as SupportCaseRow;

afterEach(cleanup);

describe("SupportConversation: an unsent reply or note", () => {
  it("asks before the page is left while a reply is typed, and lets it go once it is cleared", () => {
    Element.prototype.scrollIntoView = () => {};
    render(createElement(SupportConversation, { supportCase, messages: [], notes: [] }));
    expect(leaving()).toBe(false);

    const reply = screen.getByLabelText("Reply to the merchant");
    fireEvent.change(reply, { target: { value: "أهلا، شنو رقم الطلب؟" } });
    expect(leaving()).toBe(true);

    fireEvent.change(reply, { target: { value: "" } });
    expect(leaving()).toBe(false);
  });

  it("asks while a staff note is typed", () => {
    Element.prototype.scrollIntoView = () => {};
    render(createElement(SupportConversation, { supportCase, messages: [], notes: [] }));
    fireEvent.click(screen.getByText("Staff note"));
    fireEvent.change(screen.getByLabelText("Staff note"), { target: { value: "Checked Prime, waiting on them" } });
    expect(leaving()).toBe(true);
  });
});
