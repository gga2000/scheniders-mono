// @vitest-environment jsdom
// =====================================================================
// image_gallery stack — the carousel's position dots
// =====================================================================
// One dot per card, the first current; a tap scrolls the track to that
// card (mirrored in a reversed Arabic track) and the dot that follows the
// scroll position becomes current. On screen it autoplays, wrapping, until
// a touch; never under reduced motion. One card draws no dots.
// =====================================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { AUTOPLAY_MS, ProofCarouselDots } from "./image_gallery.stack";

afterEach(cleanup);

let showTrack: (visible: boolean) => void = () => {};

class FakeObserver {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    showTrack = (visible) => cb([{ isIntersecting: visible }]);
  }
  observe() {}
  disconnect() {}
}

function setup(rtl: boolean, count = 3, reduce = false) {
  globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
  const track = document.createElement("ol");
  track.id = "proof-track";
  for (let i = 0; i < count; i++) {
    const li = document.createElement("li");
    Object.defineProperty(li, "offsetWidth", { value: 300 });
    track.appendChild(li);
  }
  track.scrollTo = vi.fn() as unknown as typeof track.scrollTo;
  document.body.appendChild(track);
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
  const labels = Array.from({ length: count }, (_, i) => `التعليق ${i + 1}`);
  const view = render(<ProofCarouselDots trackId="proof-track" rtl={rtl} labels={labels} />);
  return { track, view };
}

afterEach(() => {
  document.getElementById("proof-track")?.remove();
});

describe("ProofCarouselDots", () => {
  it("one dot per card, the first current", () => {
    const { view } = setup(false);
    const dots = view.getAllByRole("button");
    expect(dots).toHaveLength(3);
    expect(dots[0]?.getAttribute("aria-current")).toBe("true");
    expect(dots[1]?.hasAttribute("aria-current")).toBe(false);
    expect(dots[2]?.getAttribute("aria-label")).toBe("التعليق 3");
  });

  it("a tap scrolls to the card, mirrored in a reversed track", () => {
    const ltr = setup(false);
    fireEvent.click(ltr.view.getByRole("button", { name: "التعليق 3" }));
    expect(ltr.track.scrollTo).toHaveBeenCalledWith({ left: 600, behavior: "smooth" });
    cleanup();
    ltr.track.remove();
    const rtl = setup(true);
    fireEvent.click(rtl.view.getByRole("button", { name: "التعليق 2" }));
    expect(rtl.track.scrollTo).toHaveBeenCalledWith({ left: -300, behavior: "smooth" });
  });

  it("follows the scroll position", () => {
    const { track, view } = setup(true);
    Object.defineProperty(track, "scrollLeft", { value: -310, configurable: true });
    act(() => {
      track.dispatchEvent(new Event("scroll"));
    });
    expect(view.getByRole("button", { name: "التعليق 2" }).getAttribute("aria-current")).toBe("true");
  });

  it("autoplays one card per tick while on screen, wrapping to the first", () => {
    vi.useFakeTimers();
    try {
      const { track } = setup(true);
      act(() => showTrack(true));
      act(() => {
        vi.advanceTimersByTime(AUTOPLAY_MS);
      });
      expect(track.scrollTo).toHaveBeenLastCalledWith({ left: -300, behavior: "smooth" });
      Object.defineProperty(track, "scrollLeft", { value: -600, configurable: true });
      act(() => {
        track.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(AUTOPLAY_MS);
      });
      expect(track.scrollTo).toHaveBeenLastCalledWith({ left: -0, behavior: "smooth" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops for good once the shopper touches the track, and waits while off screen", () => {
    vi.useFakeTimers();
    try {
      const { track } = setup(false);
      act(() => {
        vi.advanceTimersByTime(AUTOPLAY_MS * 2);
      });
      expect(track.scrollTo).not.toHaveBeenCalled();
      act(() => showTrack(true));
      track.dispatchEvent(new Event("pointerdown"));
      act(() => {
        vi.advanceTimersByTime(AUTOPLAY_MS * 2);
      });
      expect(track.scrollTo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never autoplays under reduced motion", () => {
    vi.useFakeTimers();
    try {
      const { track } = setup(false, 3, true);
      act(() => showTrack(true));
      act(() => {
        vi.advanceTimersByTime(AUTOPLAY_MS * 2);
      });
      expect(track.scrollTo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("one card draws no dots", () => {
    const { view } = setup(false, 1);
    expect(view.queryAllByRole("button")).toHaveLength(0);
  });
});
