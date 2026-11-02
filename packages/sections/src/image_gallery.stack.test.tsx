// @vitest-environment jsdom
// =====================================================================
// image_gallery stack — the carousel's position dots
// =====================================================================
// One dot per card, the first current; a tap scrolls the track to that
// card (mirrored in a reversed Arabic track) and the dot that follows the
// scroll position becomes current. One card draws no dots.
// =====================================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ProofCarouselDots } from "./image_gallery.stack";

afterEach(cleanup);

function setup(rtl: boolean, count = 3) {
  const track = document.createElement("ol");
  track.id = "proof-track";
  for (let i = 0; i < count; i++) {
    const li = document.createElement("li");
    Object.defineProperty(li, "offsetWidth", { value: 300 });
    track.appendChild(li);
  }
  track.scrollTo = vi.fn() as unknown as typeof track.scrollTo;
  document.body.appendChild(track);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
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

  it("one card draws no dots", () => {
    const { view } = setup(false, 1);
    expect(view.queryAllByRole("button")).toHaveLength(0);
  });
});
