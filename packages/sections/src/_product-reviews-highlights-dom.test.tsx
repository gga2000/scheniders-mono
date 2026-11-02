// @vitest-environment jsdom
// =====================================================================
// product_reviews highlights — word buttons, the carousel and «كمّل», in a DOM
// =====================================================================
// Every review sits in one swipe track in D10 order (Ahmed's 3★ last),
// with one dot per card. A word button highlights and never filters: no
// card moves, the carousel stops and brings the first marked card into
// view, a second tap clears. «كمّل» shows only on a body that overflows
// its clamp. With `hash_only`, #reviews still opens the form.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import { productCtx } from "./_pdp-fixtures";
import { IRAQ_REDESIGN_TENANT } from "./_pdp-redesign-fixtures";
import { WAYFER_REVIEWS, wayferProduct } from "./_pdp-wayfer-fixtures";

const HIGHLIGHTS = {
  heading_i18n: { ar: "شنو گالوا اللي جرّبوه" },
  show_form: true,
  layout: "highlights",
  form_entry: "hash_only",
  visible_count: 3,
  theme_words: [
    { key: "longevity", label_i18n: { ar: "الثبات" }, match_terms: ["ثبات"] },
    { key: "tester", label_i18n: { ar: "التيستر" }, match_terms: ["تيستر"] },
    { key: "luxury", label_i18n: { ar: "فخامة" }, match_terms: ["فخم"] },
    { key: "packaging", label_i18n: { ar: "العلبة والتغليف" }, match_terms: ["تغليف", "علبه"] },
    { key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" } },
  ],
  review_curation: [
    { review_id: "fcd04048-2a8c-4377-a5c3-2e7f7c20b628", tags: ["reorder"] },
    { review_id: "aeb344f2-8597-45f7-b639-99973d6f1a6f", tags: ["reorder"] },
  ],
};

/** D10 with the reorder tags: حازم and ياسين each count one topic more. */
const ORDER = ["احمد الشمري", "حازم السيد", "مصطفى علي", "ياسين", "eng. سيف", "Ahmed"];

const scrollIntoView = vi.fn();

function mount(input: unknown = HIGHLIGHTS) {
  return render(
    <StoreBaseProvider base="/s/fixture-store">
      <product_reviews.render
        props={product_reviews.schema.parse(input)}
        ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT })}
      />
    </StoreBaseProvider>,
  );
}

function names(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-review-card]")].map(
    (li) => WAYFER_REVIEWS.find((r) => r.id === li.getAttribute("data-review-card"))?.author_name ?? "?",
  );
}

function button(container: HTMLElement, key: string): HTMLElement {
  const b = container.querySelector<HTMLElement>(`[data-theme-word="${key}"]`);
  if (!b) throw new Error(`no button ${key}`);
  return b;
}

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  // jsdom has neither; the carousel dots need both.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  globalThis.IntersectionObserver = class {
    observe(): void {}
    disconnect(): void {}
  } as unknown as typeof IntersectionObserver;
});

function track(container: HTMLElement): HTMLElement {
  const t = container.querySelector<HTMLElement>("[data-review-list]");
  if (!t) throw new Error("no track");
  return t;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("word buttons", () => {
  it("a tap marks the topic's words, keeps every card, stops the carousel and shows the first mark", () => {
    const { container } = mount();
    const stops = vi.fn();
    track(container).addEventListener("bk-carousel-stop", stops);
    fireEvent.click(button(container, "longevity"));
    expect(button(container, "longevity").getAttribute("aria-pressed")).toBe("true");
    expect(names(container)).toEqual(ORDER);
    const marked = [...container.querySelectorAll("mark[data-term]")].map((m) => m.textContent);
    expect(marked).toEqual(["بثباته", "الثبات", "ثبات", "وثباته"]);
    expect(stops).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector("mark[data-term]")?.closest("[data-review-card]"));
  });

  it("a second tap clears and does not scroll again", () => {
    const { container } = mount();
    fireEvent.click(button(container, "longevity"));
    fireEvent.click(button(container, "longevity"));
    expect(button(container, "longevity").getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll("mark[data-term]")).toHaveLength(0);
    expect(names(container)).toEqual(ORDER);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("a tag-only topic marks the card edge, not words", () => {
    const { container } = mount();
    fireEvent.click(button(container, "reorder"));
    expect(container.querySelectorAll("mark[data-term]")).toHaveLength(0);
    const edged = [...container.querySelectorAll("[data-term-card]")].map(
      (li) => WAYFER_REVIEWS.find((r) => r.id === li.getAttribute("data-review-card"))?.author_name,
    );
    expect(edged).toEqual(["حازم السيد", "ياسين"]);
  });
});

describe("the press announcement", () => {
  function status(container: HTMLElement): HTMLElement {
    const el = container.querySelector<HTMLElement>('[role="status"]');
    if (!el) throw new Error("no status line");
    return el;
  }

  it("is one polite status line, empty until a topic is pressed", () => {
    const { container } = mount();
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(status(container).getAttribute("aria-live")).toBe("polite");
    expect(status(container).textContent).toBe("");
  });

  it("reads the pressed topic's count, and empties on un-press", () => {
    const { container } = mount();
    expect(button(container, "longevity").querySelector("bdi")?.textContent).toBe("3");
    fireEvent.click(button(container, "longevity"));
    expect(status(container).textContent).toBe("ذكروا «الثبات» في 3 تقييمات");
    fireEvent.click(button(container, "luxury"));
    expect(status(container).textContent).toBe("ذكروا «فخامة» في تقييمين");
    fireEvent.click(button(container, "luxury"));
    expect(status(container).textContent).toBe("");
  });
});

describe("the carousel", () => {
  it("holds every review in D10 order, Ahmed's 3★ last, the first featured", () => {
    const { container } = mount();
    expect(names(container)).toEqual(ORDER);
    expect(container.querySelector("[data-featured]")?.getAttribute("data-review-card")).toBe(
      container.querySelector("[data-review-card]")?.getAttribute("data-review-card"),
    );
    expect(container.querySelector("[data-reviews-show-all]")).toBeNull();
  });

  it("is a reversed snap track in Arabic with one labelled dot per card", () => {
    const { container } = mount();
    const t = track(container);
    expect(t.className).toContain("snap-x");
    expect(t.className).toContain("flex-row-reverse");
    expect(t.closest('[aria-roledescription="carousel"]')?.getAttribute("aria-label")).toBe("تقييمات الزباين");
    const dots = [...container.querySelectorAll("[data-carousel-dots] button")];
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual(ORDER.map((_, i) => `التقييم ${i + 1}`));
    expect(dots.every((d) => d.getAttribute("aria-controls") === t.id)).toBe(true);
  });
});

describe("«كمّل»", () => {
  it("shows only on a body taller than its clamp, and opens it", () => {
    const tall = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(200);
    const clamp = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(80);
    const { container } = mount();
    const more = container.querySelectorAll("[data-read-more]");
    expect(more).toHaveLength(6);
    const first = more[0];
    if (!(first instanceof HTMLElement)) throw new Error("no «كمّل»");
    fireEvent.click(first);
    expect(container.querySelectorAll("[data-read-more]")).toHaveLength(5);
    expect(container.querySelector("[data-featured] p")?.className).not.toContain("line-clamp");
    tall.mockRestore();
    clamp.mockRestore();
  });

  it("does not show when the body fits", () => {
    const { container } = mount();
    expect(container.querySelectorAll("[data-read-more]")).toHaveLength(0);
  });

  it("re-measures when the clamped body resizes", () => {
    const callbacks: Array<() => void> = [];
    const observed: Element[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          callbacks.push(cb);
        }
        observe(el: Element): void {
          observed.push(el);
        }
        unobserve(): void {}
        disconnect = disconnect;
      },
    );
    const { container, unmount } = mount();
    expect(container.querySelectorAll("[data-read-more]")).toHaveLength(0);
    expect(observed.every((el) => el.tagName === "P")).toBe(true);
    expect(observed.length).toBeGreaterThan(0);
    // The viewport narrows: the bodies now overflow their clamp.
    const tall = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(200);
    const clamp = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(80);
    act(() => {
      for (const cb of callbacks) cb();
    });
    expect(container.querySelectorAll("[data-read-more]")).toHaveLength(6);
    unmount();
    expect(disconnect).toHaveBeenCalled();
    tall.mockRestore();
    clamp.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("hash_only", () => {
  it("#reviews opens the form and focuses the first star", () => {
    window.history.replaceState(null, "", "/#reviews");
    const { container } = mount();
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(form?.querySelector('[role="radiogroup"] button'));
    expect(container.querySelector("[data-review-entry]")).toBeNull();
  });
});
