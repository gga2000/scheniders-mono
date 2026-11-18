// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupportSpike } from "@/lib/support-spike";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-live-tick", () => ({ useLiveTick: () => Date.now() }));
const spike = vi.hoisted(() => ({ data: null as SupportSpike | null }));
vi.mock("@/hooks/use-support-cases", () => ({
  useSupportNotice: () => ({ data: null, isError: false }),
  useSupportNoticePost: () => ({ mutate: vi.fn(), isPending: false }),
  useSupportNoticeEnd: () => ({ mutate: vi.fn(), isPending: false }),
  useSupportSpike: () => spike,
}));

import { SupportNoticeBar } from "./support-notice-bar";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and a notice not yet posted was gone. Leaving now asks first.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  cleanup();
  spike.data = null;
});

describe("SupportNoticeBar: a notice not yet posted", () => {
  it("asks before the page is left once typed, and lets it go after Cancel", () => {
    render(createElement(SupportNoticeBar));
    fireEvent.click(screen.getByText("Post a notice"));
    expect(leaving()).toBe(false);

    fireEvent.change(screen.getByLabelText("Notice for every merchant"), { target: { value: "برايم متأخر اليوم" } });
    expect(leaving()).toBe(true);

    fireEvent.click(screen.getByText("Cancel"));
    expect(leaving()).toBe(false);
  });

  it("asks for a notice taken from the problem spotter, and not after Not now", () => {
    spike.data = { topic: "delivery", label: "4 shops wrote about delivery", shops: 4, notice: "التوصيل متأخر اليوم" };
    const view = render(createElement(SupportNoticeBar));
    fireEvent.click(screen.getByText("Not now"));
    expect(leaving()).toBe(false);
    view.unmount();

    render(createElement(SupportNoticeBar));
    fireEvent.click(screen.getByText("Use this notice"));
    expect(leaving()).toBe(true);
  });
});
