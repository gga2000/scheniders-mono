// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Lead } from "@/types/leads";

const convert = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }));
vi.mock("@/hooks/use-lead-mutations", () => ({ useConvertLead: () => convert }));

import { LeadConvertDialog } from "./lead-convert-dialog";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and the conversion notes being written were gone. Leaving now asks first.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const lead = {
  id: "l1",
  merchant_name: "Kawkab",
  platform: "instagram",
  tier: "bronze",
  follower_count: 1200,
  lead_score: 40,
  estimated_daily_orders: 3,
  page_phone: "07701234567",
  prospect_tenant_id: null,
} as unknown as Lead;

const dialog = (isOpen: boolean) => createElement(LeadConvertDialog, { isOpen, onClose: () => {}, lead });

afterEach(cleanup);

describe("LeadConvertDialog: notes being written", () => {
  it("ask before the page is left, and let it go once the dialog is closed", () => {
    const view = render(dialog(true));
    expect(leaving()).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Any notes about this conversion..."), { target: { value: "Paid by Qi" } });
    expect(leaving()).toBe(true);

    view.rerender(dialog(false));
    expect(leaving()).toBe(false);
  });
});
