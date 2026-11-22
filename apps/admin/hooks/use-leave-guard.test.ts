// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGN_OUT_QUESTION, holdLeaveGuard, mayStopHeldWork, useLeaveGuard, useLinkLeaveQuestion } from "./use-leave-guard";

/*
 * Round 15: when a sign-in ended, a background read reloaded the page within
 * seconds and the lead or reply being typed was gone.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useLeaveGuard", () => {
  afterEach(cleanup);

  it("asks before the page is left while typing is unsaved", () => {
    renderHook(() => useLeaveGuard(true));
    expect(leaving()).toBe(true);
  });

  it("lets the page go when nothing is unsaved, and once the typing is saved", () => {
    const view = renderHook(({ unsaved }) => useLeaveGuard(unsaved), { initialProps: { unsaved: false } });
    expect(leaving()).toBe(false);
    view.rerender({ unsaved: true });
    expect(leaving()).toBe(true);
    view.rerender({ unsaved: false });
    expect(leaving()).toBe(false);
  });

  it("lets the page go once the form is gone", () => {
    const view = renderHook(() => useLeaveGuard(true));
    view.unmount();
    expect(leaving()).toBe(false);
  });
});

/*
 * Round 23: a product import goes on after staff move to another console
 * page, so its guard must outlast the page, and a move by a link must ask.
 */
describe("holdLeaveGuard", () => {
  it("asks until released, from any page, and a second release changes nothing", () => {
    const release = holdLeaveGuard();
    expect(leaving()).toBe(true);
    release();
    expect(leaving()).toBe(false);
    release();
    expect(leaving()).toBe(false);
  });

  it("keeps asking while another hold or a page's guard is still on", () => {
    const first = holdLeaveGuard();
    const second = holdLeaveGuard();
    first();
    expect(leaving()).toBe(true);
    second();
    expect(leaving()).toBe(false);
    const view = renderHook(() => useLeaveGuard(true));
    holdLeaveGuard()();
    expect(leaving()).toBe(true);
    view.unmount();
  });
});

/*
 * Round 24 (security new 2): Sign out is a button, so neither question saw
 * it, and a running import went on for whoever signed in next on the tab.
 */
describe("mayStopHeldWork", () => {
  it("asks before Sign out only while held work runs, and goes on only on OK", () => {
    const confirm = vi.spyOn(window, "confirm");
    try {
      expect(mayStopHeldWork()).toBe(true);
      expect(confirm).not.toHaveBeenCalled();

      const release = holdLeaveGuard();
      confirm.mockReturnValueOnce(false);
      expect(mayStopHeldWork()).toBe(false);
      confirm.mockReturnValueOnce(true);
      expect(mayStopHeldWork()).toBe(true);
      expect(confirm).toHaveBeenCalledWith(SIGN_OUT_QUESTION);

      release();
      release();
      confirm.mockClear();
      expect(mayStopHeldWork()).toBe(true);
      expect(confirm).not.toHaveBeenCalled();

      // A second release did not count twice: the next hold still asks.
      const again = holdLeaveGuard();
      confirm.mockReturnValueOnce(false);
      expect(mayStopHeldWork()).toBe(false);
      again();
    } finally {
      confirm.mockRestore();
    }
  });
});

describe("useLinkLeaveQuestion", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  function link(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
    const a = document.createElement("a");
    a.href = href;
    for (const [name, value] of Object.entries(attrs)) a.setAttribute(name, value);
    a.textContent = "Merchants";
    document.body.append(a);
    return a;
  }

  it("asks before a link moves to another console page, and Cancel stays", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useLinkLeaveQuestion("Leave?"));
    // fireEvent answers false when the click's default was prevented.
    expect(fireEvent.click(link("/merchants"))).toBe(false);
    expect(confirm).toHaveBeenCalledWith("Leave?");
    confirm.mockReturnValue(true);
    expect(fireEvent.click(link("/trials?filter=ending"))).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("does not ask for a new tab, the same page, another site, or once the question is gone", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = renderHook(({ question }: { question: string | null }) => useLinkLeaveQuestion(question), {
      initialProps: { question: "Leave?" as string | null },
    });
    expect(fireEvent.click(link("/merchants"), { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link("/merchants", { target: "_blank" }))).toBe(true);
    expect(fireEvent.click(link(window.location.pathname + window.location.search))).toBe(true);
    expect(fireEvent.click(link("https://example.com/help"))).toBe(true);
    view.rerender({ question: null });
    expect(fireEvent.click(link("/merchants"))).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
