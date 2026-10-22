// @vitest-environment jsdom
// =====================================================================
// image_gallery — the full-screen swipe viewer
// =====================================================================
// What only a DOM can show: a tap on a server-rendered card opens the
// viewer at that picture, prev/next and swiping move the counter, the
// page scroll is locked while open, every close path (button, Escape via
// the native close event, backdrop) restores it and hands focus back to
// the card, and reduced motion jumps instead of gliding.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { GalleryViewer } from "./image_gallery.client";
import type {
  GalleryViewerImage,
  GalleryViewerLabels,
} from "./image_gallery.client";

const TOTAL = 9;
const images: GalleryViewerImage[] = Array.from({ length: TOTAL }, (_, i) => ({
  url: `https://cdn.example.com/shot-${i + 1}.jpeg`,
  alt: `رسالة من زبون ${i + 1} من ${TOTAL}`,
  counter: `${i + 1} من ${TOTAL}`,
}));
const AR: GalleryViewerLabels = {
  close: "إغلاق",
  prev: "الصورة السابقة",
  next: "الصورة التالية",
};
const EN: GalleryViewerLabels = {
  close: "Close",
  prev: "Previous image",
  next: "Next image",
};

let reduced = false;
const scrollTo = vi.fn();

beforeEach(() => {
  reduced = false;
  scrollTo.mockClear();
  // jsdom has no modal dialog: open/close just flip the attribute, and
  // close fires the native "close" event like a browser does.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  Element.prototype.scrollTo = scrollTo;
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduce") ? reduced : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  // The track measures the viewport width; jsdom lays nothing out.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 390;
    },
  });
  document.documentElement.style.overflow = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

function mount(labels: GalleryViewerLabels = AR) {
  const utils = render(
    <GalleryViewer images={images} labels={labels} dialogLabel="كلامهم مو كلامنا">
      <div role="region">
        {images.map((img, i) => (
          <button key={i} type="button" data-gallery-open={i} aria-label={img.alt}>
            <span data-card-face="">{img.alt}</span>
          </button>
        ))}
      </div>
    </GalleryViewer>,
  );
  const card = (i: number) => {
    const el = utils.container.querySelector(`[data-gallery-open="${i}"]`);
    if (!(el instanceof HTMLButtonElement)) throw new Error(`card ${i} missing`);
    return el;
  };
  const dialog = () => {
    const el = utils.container.querySelector("dialog");
    if (!(el instanceof HTMLDialogElement)) throw new Error("dialog missing");
    return el;
  };
  const track = () => {
    const el = dialog().querySelector(".snap-x");
    if (!(el instanceof HTMLDivElement)) throw new Error("track missing");
    return el;
  };
  const counter = () => dialog().querySelector("[aria-live]")?.textContent;
  const slides = () => dialog().querySelectorAll('[aria-roledescription="slide"]');
  const button = (label: string) => {
    const el = dialog().querySelector(`button[aria-label="${label}"]`);
    if (!(el instanceof HTMLButtonElement)) throw new Error(`${label} missing`);
    return el;
  };
  return { ...utils, card, dialog, track, counter, slides, button };
}

describe("GalleryViewer", () => {
  it("renders nothing inside the dialog until opened", () => {
    const v = mount();
    expect(v.dialog().open).toBe(false);
    expect(v.slides()).toHaveLength(0);
  });

  it("opens at the tapped picture", () => {
    const v = mount();
    fireEvent.click(v.card(2));
    expect(v.dialog().open).toBe(true);
    expect(v.counter()).toBe("3 من 9");
    expect(v.slides()).toHaveLength(TOTAL);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(v.track().scrollLeft).toBe(780);
  });

  it("opens from a tap on anything inside a card", () => {
    const v = mount();
    const face = v.card(5).querySelector("[data-card-face]");
    if (!face) throw new Error("card face missing");
    fireEvent.click(face);
    expect(v.counter()).toBe("6 من 9");
  });

  it("next glides one slide on", () => {
    const v = mount();
    fireEvent.click(v.card(2));
    fireEvent.click(v.button(AR.next));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1170, behavior: "smooth" });
    expect(v.counter()).toBe("4 من 9");
  });

  it("jumps instead of gliding under reduced motion", () => {
    reduced = true;
    const v = mount();
    fireEvent.click(v.card(2));
    fireEvent.click(v.button(AR.prev));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 390, behavior: "auto" });
    expect(v.counter()).toBe("2 من 9");
  });

  it("disables prev at the first picture and next at the last", () => {
    const v = mount();
    fireEvent.click(v.card(0));
    expect(v.button(AR.prev).disabled).toBe(true);
    expect(v.button(AR.next).disabled).toBe(false);
    act(() => v.dialog().close());
    fireEvent.click(v.card(8));
    expect(v.button(AR.next).disabled).toBe(true);
    expect(v.button(AR.prev).disabled).toBe(false);
  });

  it("follows a swipe", () => {
    const v = mount();
    fireEvent.click(v.card(0));
    const track = v.track();
    track.scrollLeft = 1950;
    fireEvent.scroll(track);
    expect(v.counter()).toBe("6 من 9");
  });

  it("holds the counter on the target while a glide is in flight", () => {
    const v = mount();
    fireEvent.click(v.card(0));
    fireEvent.click(v.button(AR.next));
    const track = v.track();
    // A smooth scroll reports every frame; the first half still rounds to 0.
    for (const left of [1, 34, 122, 164]) {
      track.scrollLeft = left;
      fireEvent.scroll(track);
      expect(v.counter()).toBe("2 من 9");
      expect(v.button(AR.prev).disabled).toBe(false);
    }
  });

  it("a second tap mid-glide advances from the target, not the live position", () => {
    const v = mount();
    fireEvent.click(v.card(0));
    fireEvent.click(v.button(AR.next));
    const track = v.track();
    track.scrollLeft = 80;
    fireEvent.scroll(track);
    fireEvent.click(v.button(AR.next));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 780, behavior: "smooth" });
    expect(v.counter()).toBe("3 من 9");
    // Passing slide 2 on the way does not pull the counter back.
    track.scrollLeft = 390;
    fireEvent.scroll(track);
    expect(v.counter()).toBe("3 من 9");
    track.scrollLeft = 780;
    fireEvent.scroll(track);
    expect(v.counter()).toBe("3 من 9");
  });

  it("follows the live position again once the glide lands", () => {
    const v = mount();
    fireEvent.click(v.card(0));
    fireEvent.click(v.button(AR.next));
    const track = v.track();
    track.scrollLeft = 390;
    fireEvent.scroll(track);
    track.scrollLeft = 1170;
    fireEvent.scroll(track);
    expect(v.counter()).toBe("4 من 9");
  });

  it("a finger on the track takes over from an unfinished glide", () => {
    const v = mount();
    fireEvent.click(v.card(0));
    fireEvent.click(v.button(AR.next));
    const track = v.track();
    fireEvent.pointerDown(track);
    track.scrollLeft = 1950;
    fireEvent.scroll(track);
    expect(v.counter()).toBe("6 من 9");
  });

  it("scrollend releases an unfinished glide", () => {
    const v = mount();
    fireEvent.click(v.card(0));
    fireEvent.click(v.button(AR.next));
    const track = v.track();
    track.scrollLeft = 1560;
    act(() => {
      track.dispatchEvent(new Event("scrollend"));
    });
    expect(v.counter()).toBe("5 من 9");
  });

  it("fills the slide width so a small screenshot is enlarged, not shrunk", () => {
    const v = mount();
    fireEvent.click(v.card(0));
    const img = v.slides()[0]?.querySelector("img");
    if (!img) throw new Error("slide img missing");
    const cls = img.className.split(/\s+/);
    expect(cls).toContain("w-full");
    expect(cls).toContain("h-auto");
    expect(cls).toContain("max-h-full");
    expect(cls).toContain("object-contain");
    expect(cls).not.toContain("w-auto");
  });

  it("ignores a scroll before the track has a width", () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 0;
      },
    });
    const v = mount();
    fireEvent.click(v.card(3));
    const track = v.track();
    track.scrollLeft = 500;
    fireEvent.scroll(track);
    expect(v.counter()).toBe("4 من 9");
  });

  it("the close button closes, unlocks the page and returns focus", () => {
    const v = mount();
    const opener = v.card(2);
    fireEvent.click(opener);
    fireEvent.click(v.button(AR.close));
    expect(v.dialog().open).toBe(false);
    expect(v.slides()).toHaveLength(0);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });

  it("Escape (the native close event) does the same", () => {
    const v = mount();
    const opener = v.card(4);
    fireEvent.click(opener);
    act(() => {
      v.dialog().open = false;
      v.dialog().dispatchEvent(new Event("close"));
    });
    expect(v.slides()).toHaveLength(0);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });

  it("a tap on the dimmed slide area closes", () => {
    const v = mount();
    fireEvent.click(v.card(1));
    const slide = v.slides()[1];
    if (!slide) throw new Error("slide missing");
    fireEvent.click(slide);
    expect(v.dialog().open).toBe(false);
  });

  it("a tap on the picture or a control does not close", () => {
    const v = mount();
    fireEvent.click(v.card(1));
    const img = v.slides()[1]?.querySelector("img");
    if (!img) throw new Error("slide img missing");
    fireEvent.click(img);
    expect(v.dialog().open).toBe(true);
    fireEvent.click(v.button(AR.prev));
    expect(v.dialog().open).toBe(true);
  });

  it("speaks English when the server hands English labels", () => {
    const v = mount(EN);
    fireEvent.click(v.card(0));
    expect(v.button("Previous image")).toBeTruthy();
    expect(v.button("Next image")).toBeTruthy();
    expect(v.button("Close")).toBeTruthy();
  });
});
