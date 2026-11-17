// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { LeadFormData } from "@/types/leads";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/use-industries", () => ({ useIndustries: () => ({ data: [] }) }));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: vi.fn() }));

import { useLeadFormController, type LeadFormSubmitResult } from "./use-lead-form-controller";

type Submit = (data: LeadFormData, changes: Partial<LeadFormData>) => Promise<LeadFormSubmitResult>;

interface Props {
  open: boolean;
  initialData: Partial<LeadFormData>;
}

// A host passes a new starting object on every render, as the lead page does
// with `initialData={leadToFormData(lead)}`.
const lead = (over: Partial<LeadFormData> = {}): Partial<LeadFormData> => ({
  merchant_name: "Natty Fashion",
  management_name: "Owner",
  page_phone: "07701234567",
  ...over,
});

function setup(onSubmit: Submit) {
  const onClose = vi.fn();
  const view = renderHook(
    (props: Props) => useLeadFormController({ ...props, onSubmit, onClose }),
    { initialProps: { open: true, initialData: lead() } },
  );
  return { ...view, onClose };
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  toast.info.mockReset();
});

describe("useLeadFormController: the form starts over only when it opens", () => {
  it("keeps what was typed when the host renders again with a new starting object", () => {
    const { result, rerender } = setup(vi.fn());
    act(() => result.current.update("management_name", "Typed by me"));

    rerender({ open: true, initialData: lead() });

    expect(result.current.form.management_name).toBe("Typed by me");
  });

  it("keeps what was typed when a colleague's change arrives, and sends only this person's field", async () => {
    const onSubmit = vi.fn<Submit>().mockResolvedValue(true);
    const { result, rerender } = setup(onSubmit);
    act(() => result.current.update("management_name", "Typed by me"));

    rerender({ open: true, initialData: lead({ page_phone: "07809876543" }) });
    expect(result.current.form.management_name).toBe("Typed by me");

    await act(() => result.current.submit(false));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1]).toEqual({ management_name: "Typed by me" });
  });

  it("keeps what was typed when the save fails while the host renders again", async () => {
    let fail: (e: Error) => void = () => {};
    const onSubmit = vi.fn<Submit>(() => new Promise((_, reject) => { fail = reject; }));
    const { result, rerender } = setup(onSubmit);
    act(() => result.current.update("management_name", "Typed by me"));

    let saving: Promise<void> = Promise.resolve();
    act(() => { saving = result.current.submit(false); });
    rerender({ open: true, initialData: lead() });
    await act(async () => {
      fail(new Error("Failed to update lead"));
      await saving;
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to update lead");
    expect(result.current.form.management_name).toBe("Typed by me");
  });

  it("starts from the lead as it is now when the form is opened again", () => {
    const { result, rerender } = setup(vi.fn());
    act(() => result.current.update("management_name", "Typed, then closed"));

    rerender({ open: false, initialData: lead() });
    rerender({ open: true, initialData: lead({ management_name: "Colleague's name" }) });

    expect(result.current.form.management_name).toBe("Colleague's name");
  });

  it("says nothing changed, and closes, when the host had nothing to send", async () => {
    const { result, onClose } = setup(vi.fn<Submit>().mockResolvedValue("unchanged"));

    await act(() => result.current.submit(false));

    expect(toast.info).toHaveBeenCalledWith("Nothing changed");
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
