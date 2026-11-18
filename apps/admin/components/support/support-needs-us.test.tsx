// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NeedsUsShop } from "@/lib/support";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-live-tick", () => ({ useLiveTick: () => Date.now() }));
const shop: NeedsUsShop = {
  tenant_id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f",
  business_name: "Kawkab",
  display_id: 100095,
  status: "active",
  problems: [{ code: "wallet_empty", since: null, detail: null }],
  owner_name: "Ali",
  open_case: null,
  last_contact_at: null,
};
vi.mock("@/hooks/use-support-cases", () => ({
  useSupportNeedsUs: () => ({ data: [shop], isLoading: false, isError: false }),
  useSupportStartConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SupportNeedsUs } from "./support-needs-us";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and a first message not yet sent was gone. Leaving now asks first.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(cleanup);

describe("SupportNeedsUs: a first message not yet sent", () => {
  it("asks before the page is left, and lets it go after Cancel", () => {
    render(createElement(SupportNeedsUs, { onOpenCase: () => {} }));
    expect(leaving()).toBe(false);

    fireEvent.click(screen.getByText("Write first"));
    fireEvent.change(screen.getByLabelText("First message to Kawkab"), { target: { value: "مرحبا علي، محفظتك فارغة" } });
    expect(leaving()).toBe(true);

    fireEvent.click(screen.getByText("Cancel"));
    expect(leaving()).toBe(false);
  });
});
