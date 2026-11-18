// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLeaveGuard } from "./use-leave-guard";

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
