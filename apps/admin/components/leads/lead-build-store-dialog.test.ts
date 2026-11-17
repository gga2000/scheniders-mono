// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Lead } from "@/types/leads";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-industries", () => ({ useIndustries: () => ({ data: [] }) }));
vi.mock("@/hooks/use-lead-mutations", () => ({
  useBuildStore: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
}));

import { LeadBuildStoreDialog } from "./lead-build-store-dialog";

/*
 * The Build Store form started over whenever the lead page passed a new lead
 * object: a colleague's edit or a refetch when the window regains focus wiped
 * the name and up to ten typed products. It now starts from the lead only
 * when it opens.
 */

const lead = (over: Partial<Lead> = {}): Lead =>
  ({ id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f", merchant_name: "Kawkab", industry_id: null, ...over }) as Lead;

const dialog = (isOpen: boolean, l: Lead) => createElement(LeadBuildStoreDialog, { isOpen, onClose: () => {}, lead: l });
const nameBox = () => screen.getByPlaceholderText("e.g. Zara Baghdad") as HTMLInputElement;

afterEach(cleanup);

describe("LeadBuildStoreDialog: the form starts from the lead only when it opens", () => {
  it("keeps what was typed when the lead is read again while the dialog is open", () => {
    const view = render(dialog(true, lead()));
    expect(nameBox().value).toBe("Kawkab");

    fireEvent.change(nameBox(), { target: { value: "Kawkab Baghdad" } });
    view.rerender(dialog(true, lead({ merchant_name: "Kawkab (edited by a colleague)" })));

    expect(nameBox().value).toBe("Kawkab Baghdad");
  });

  it("starts again from the lead the next time it opens", () => {
    const view = render(dialog(true, lead()));
    fireEvent.change(nameBox(), { target: { value: "Typed and left" } });

    view.rerender(dialog(false, lead()));
    view.rerender(dialog(true, lead({ merchant_name: "Kawkab Store" })));

    expect(nameBox().value).toBe("Kawkab Store");
  });
});
