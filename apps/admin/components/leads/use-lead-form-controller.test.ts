// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { LeadFormData } from "@/types/leads";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/use-industries", () => ({ useIndustries: () => ({ data: [] }) }));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: vi.fn() }));

import { LEAD_GONE, LEAD_GONE_TOAST, LeadGoneError, LeadListsChangedError } from "@/lib/lead-update";
import { CLASH_TOAST, useLeadFormController, type LeadFormSubmitResult } from "./use-lead-form-controller";

type Submit = (data: LeadFormData, changes: Partial<LeadFormData>, opened: LeadFormData) => Promise<LeadFormSubmitResult>;

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

function setup(onSubmit: Submit, start = lead()) {
  const onClose = vi.fn();
  const view = renderHook(
    (props: Props) => useLeadFormController({ ...props, onSubmit, onClose }),
    { initialProps: { open: true, initialData: start } },
  );
  return { ...view, onClose };
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  toast.info.mockReset();
  toast.dismiss.mockReset();
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
    // The form as it opened goes with it, so a list it changed carries the copy it changed.
    expect(onSubmit.mock.calls[0][2]).toMatchObject({ management_name: "Owner", page_phone: "07701234567" });
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

/*
 * Round 12 should-fix 8: after "A colleague changed this lead's tags" the form
 * kept its old tags, so Save could only be refused again, and closing threw
 * away everything typed. The form now takes the colleague's lists in, as shown
 * and as opened, and keeps every other field this person typed.
 */
describe("useLeadFormController: a save refused over a colleague's lists", () => {
  const CLASH = "A colleague changed this lead's tags while you had it open.";

  it("takes the colleague's lists in once they arrive, and keeps every other typed field", async () => {
    const onSubmit = vi
      .fn<Submit>()
      .mockRejectedValueOnce(new LeadListsChangedError(CLASH, ["tags"]))
      .mockResolvedValueOnce(true);
    const { result, rerender, onClose } = setup(onSubmit, lead({ tags: ["abaya"] }));
    act(() => {
      result.current.update("management_name", "Typed by me");
      result.current.update("tags", ["abaya", "called"]);
    });

    await act(() => result.current.submit(false));
    expect(toast.error).toHaveBeenCalledWith(CLASH, { id: CLASH_TOAST, duration: 15_000 });
    // Closing it as the save starts would close the new one too: sonner closes a frame or two late.
    expect(toast.dismiss).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // The lead is read again; until the colleague's copy arrives nothing moves.
    rerender({ open: true, initialData: lead({ tags: ["abaya"] }) });
    expect(result.current.form.tags).toEqual(["abaya", "called"]);

    rerender({ open: true, initialData: lead({ tags: ["abaya", "vip"] }) });
    expect(result.current.form.tags).toEqual(["abaya", "vip"]);
    expect(result.current.form.management_name).toBe("Typed by me");

    // The next Save sends this person's field over the colleague's tags, and
    // once it went through closes the clash toast: it was about the old copy.
    toast.dismiss.mockReset();
    await act(() => result.current.submit(false));
    expect(toast.dismiss).toHaveBeenCalledWith(CLASH_TOAST);
    expect(onSubmit.mock.calls[1][1]).toEqual({ management_name: "Typed by me" });
    expect(onSubmit.mock.calls[1][2].tags).toEqual(["abaya", "vip"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves the typed lists alone after any other refusal", async () => {
    const onSubmit = vi.fn<Submit>().mockRejectedValueOnce(new Error("A lead can only go to an active staff member."));
    const { result, rerender } = setup(onSubmit, lead({ tags: ["abaya"] }));
    act(() => result.current.update("tags", ["abaya", "called"]));

    await act(() => result.current.submit(false));
    rerender({ open: true, initialData: lead({ tags: ["abaya", "vip"] }) });

    expect(result.current.form.tags).toEqual(["abaya", "called"]);
  });
});

describe("useLeadFormController: a dismissal with unsaved content", () => {
  it("hands the draft save the form, only what changed, and the form as it opened", () => {
    const { result } = setup(vi.fn());
    act(() => result.current.update("management_name", "Typed by me"));
    act(() => result.current.update("handle", "@kawkab"));
    const onSaveDraft = vi.fn();

    act(() => result.current.saveDraftOnClose(onSaveDraft));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    const [data, changes, opened] = onSaveDraft.mock.calls[0];
    expect(data).toMatchObject({ management_name: "Typed by me", handle: "@kawkab" });
    // As a save sends them: the handle without its "@".
    expect(changes).toEqual({ management_name: "Typed by me", handle: "kawkab" });
    expect(opened).toMatchObject({ management_name: "Owner", page_phone: "07701234567" });
  });

  it("saves nothing when nothing was typed", () => {
    const { result } = setup(vi.fn());
    const onSaveDraft = vi.fn();

    act(() => result.current.saveDraftOnClose(onSaveDraft));

    expect(onSaveDraft).not.toHaveBeenCalled();
  });
});

describe("useLeadFormController: a sign-in that ends while typing", () => {
  function leaving(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("asks before the page is left while the form holds unsaved typing, and not once it is closed", () => {
    cleanup(); // forms the tests above left open with typing
    const { result, rerender } = setup(vi.fn());
    expect(leaving()).toBe(false);
    act(() => result.current.update("management_name", "Typed by me"));
    expect(leaving()).toBe(true);
    rerender({ open: false, initialData: lead() });
    expect(leaving()).toBe(false);
  });
});

describe("useLeadFormController: a lead a colleague deleted", () => {
  it("says so in the lead page's words, as the one deleted-lead toast", async () => {
    const { result } = setup(vi.fn(async () => Promise.reject(new LeadGoneError())));
    act(() => result.current.update("management_name", "Typed by me"));

    await act(() => result.current.submit(false));

    expect(toast.error).toHaveBeenCalledWith(LEAD_GONE, { id: LEAD_GONE_TOAST });
  });
});
