// @vitest-environment jsdom
// =====================================================================
// testimonial_cards — the rotating stage
// =====================================================================
// What only a DOM can show: that it advances on its own, that it stops
// when someone is reading it, and that it never rotates for a visitor who
// asked their system not to animate.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { TestimonialStage } from "./testimonial_cards.client";
import type { StageItem } from "./testimonial_cards.client";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const items: StageItem[] = [
  { name_i18n: { ar: "أحمد", en: "Ahmed" }, quote_i18n: { ar: "الأول", en: "First" } },
  { name_i18n: { ar: "حازم", en: "Hazem" }, quote_i18n: { ar: "الثاني", en: "Second" } },
  { name_i18n: { ar: "نورين", en: "Noreen" }, quote_i18n: { ar: "الثالث", en: "Third" } },
];

let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduce") ? reduced : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});

const mount = (rotateSeconds = 3) =>
  render(
    <TestimonialStage
      items={items}
      locale={"ar" as never}
      rotateSeconds={rotateSeconds}
    />,
  );

const quote = (c: HTMLElement) =>
  c.querySelector("[data-stage-quote]")?.textContent?.trim();

describe("TestimonialStage", () => {
  it("advances on its own", () => {
    vi.useFakeTimers();
    const { container } = mount(3);
    expect(quote(container)).toBe("الأول");
    act(() => void vi.advanceTimersByTime(3000));
    expect(quote(container)).toBe("الثاني");
  });

  it("wraps back to the first rather than stopping at the last", () => {
    vi.useFakeTimers();
    const { container } = mount(3);
    act(() => void vi.advanceTimersByTime(9000));
    expect(quote(container)).toBe("الأول");
  });

  it("holds still while someone is reading it", () => {
    // An auto-advancing quote that cannot be paused is unreadable to a
    // slow reader, which is the opposite of what the section is for.
    vi.useFakeTimers();
    const { container } = mount(3);
    const stage = container.querySelector("[data-testimonial-stage]")!;
    fireEvent.mouseEnter(stage);
    // 4000ms, not a whole number of cycles: 9000ms over three items is
    // exactly one full rotation, so it lands back on the first slide
    // whether the pause works or not.
    act(() => void vi.advanceTimersByTime(4000));
    expect(quote(container)).toBe("الأول");
    fireEvent.mouseLeave(stage);
    act(() => void vi.advanceTimersByTime(3000));
    expect(quote(container)).toBe("الثاني");
  });

  it("never rotates for a visitor who asked for reduced motion", () => {
    reduced = true;
    vi.useFakeTimers();
    const { container } = mount(3);
    act(() => void vi.advanceTimersByTime(30000));
    expect(quote(container)).toBe("الأول");
  });

  it("lets a shopper drive it directly", () => {
    const { container } = mount(3);
    const dots = container.querySelectorAll<HTMLButtonElement>("[data-stage-dot]");
    expect(dots).toHaveLength(3);
    fireEvent.click(dots[2]);
    expect(quote(container)).toBe("الثالث");
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-stage-next]")!);
    expect(quote(container)).toBe("الأول");
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-stage-prev]")!);
    expect(quote(container)).toBe("الثالث");
  });

  it("announces the change instead of swapping text silently", () => {
    const { container } = mount(3);
    expect(
      container.querySelector("[data-stage-quote]")?.getAttribute("aria-live"),
    ).toBe("polite");
  });
});
