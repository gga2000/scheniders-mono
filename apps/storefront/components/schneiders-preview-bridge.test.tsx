// =====================================================================
// SchneidersPreviewBridge — DOM behavior tests
// =====================================================================
// Mounts the bridge inside jsdom, fakes `window.parent` with a spy on
// `postMessage`, and asserts every outbound + inbound message path.
// =====================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Required by React 19+ to allow `act()` inside non-RTL test harnesses.
// Must be set BEFORE importing the component under test or any react-dom code.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SchneidersPreviewBridge } from "./schneiders-preview-bridge";

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

let parentPostMessage: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;
let originalParent: Window;

function mountBridge(): void {
  act(() => {
    root.render(<SchneidersPreviewBridge />);
  });
}

function unmountBridge(): void {
  act(() => {
    root.unmount();
  });
}

function makeSection(id: string, type = "hero_image"): HTMLDivElement {
  const section = document.createElement("div");
  section.setAttribute("data-section-id", id);
  section.setAttribute("data-section-type", type);
  // jsdom doesn't lay anything out, so getBoundingClientRect returns
  // zeros — that's fine for our `.toJSON()` assertion, we just need
  // the call to succeed.
  document.body.appendChild(section);
  return section;
}

beforeEach(() => {
  // Pretend we're in an iframe by swapping `window.parent` for a stub
  // whose `postMessage` we can spy on. jsdom defaults to
  // `window.parent === window`, which the bridge treats as "not in an
  // iframe" and bails out of all setup — so we MUST stub before mount.
  originalParent = window.parent;
  parentPostMessage = vi.fn();
  Object.defineProperty(window, "parent", {
    configurable: true,
    get: () => ({ postMessage: parentPostMessage } as unknown as Window),
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  // Tear down DOM + spies + parent stub between tests so each one starts
  // from the same clean slate.
  try {
    unmountBridge();
  } catch {
    /* not mounted */
  }
  document.body.innerHTML = "";
  Object.defineProperty(window, "parent", {
    configurable: true,
    get: () => originalParent,
  });
  vi.restoreAllMocks();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("SchneidersPreviewBridge", () => {
  it("posts a `ready` message on mount", () => {
    mountBridge();
    const readyCall = parentPostMessage.mock.calls.find(
      ([msg]) => msg?.type === "ready",
    );
    expect(readyCall).toBeTruthy();
    expect(readyCall?.[0]).toMatchObject({
      source: "schn-preview",
      type: "ready",
    });
    expect(typeof readyCall?.[0].url).toBe("string");
  });

  it("forwards section_clicked with the section id when a section is clicked", () => {
    mountBridge();
    const section = makeSection("sec-123", "hero_image");
    parentPostMessage.mockClear();

    section.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    const clickCall = parentPostMessage.mock.calls.find(
      ([msg]) => msg?.type === "section_clicked",
    );
    expect(clickCall?.[0]).toMatchObject({
      source: "schn-preview",
      type: "section_clicked",
      section_id: "sec-123",
      section_type: "hero_image",
    });
  });

  it("forwards scroll y on window scroll", () => {
    mountBridge();
    parentPostMessage.mockClear();

    // jsdom doesn't fire scroll automatically; dispatch manually.
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 42,
    });
    window.dispatchEvent(new Event("scroll"));

    const scrollCall = parentPostMessage.mock.calls.find(
      ([msg]) => msg?.type === "scrolled",
    );
    expect(scrollCall?.[0]).toMatchObject({
      source: "schn-preview",
      type: "scrolled",
      y: 42,
    });
  });

  it("calls scrollIntoView on inbound `scroll_to_section`", () => {
    mountBridge();
    const section = makeSection("target-section");
    const spy = vi.fn();
    section.scrollIntoView = spy as unknown as typeof section.scrollIntoView;

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: "schn-editor",
          type: "scroll_to_section",
          section_id: "target-section",
        },
      }),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("responds with `rect_update` to inbound `request_rect`", () => {
    mountBridge();
    makeSection("rect-target");
    parentPostMessage.mockClear();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: "schn-editor",
          type: "request_rect",
          section_id: "rect-target",
        },
      }),
    );

    const rectCall = parentPostMessage.mock.calls.find(
      ([msg]) => msg?.type === "rect_update",
    );
    expect(rectCall?.[0]).toMatchObject({
      source: "schn-preview",
      type: "rect_update",
      section_id: "rect-target",
    });
    expect(rectCall?.[0].rect).not.toBeNull();
  });

  it("responds with null rect when `request_rect` targets a missing section", () => {
    mountBridge();
    parentPostMessage.mockClear();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: "schn-editor",
          type: "request_rect",
          section_id: "does-not-exist",
        },
      }),
    );

    const rectCall = parentPostMessage.mock.calls.find(
      ([msg]) => msg?.type === "rect_update",
    );
    expect(rectCall?.[0]).toMatchObject({
      source: "schn-preview",
      type: "rect_update",
      section_id: "does-not-exist",
      rect: null,
    });
  });

  it("responds with `pong` to inbound `ping`", () => {
    mountBridge();
    parentPostMessage.mockClear();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "schn-editor", type: "ping" },
      }),
    );

    const pongCall = parentPostMessage.mock.calls.find(
      ([msg]) => msg?.type === "pong",
    );
    expect(pongCall?.[0]).toMatchObject({
      source: "schn-preview",
      type: "pong",
    });
  });

  it("does nothing when a click happens outside any section", () => {
    mountBridge();
    const outsider = document.createElement("button");
    document.body.appendChild(outsider);
    parentPostMessage.mockClear();

    outsider.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    const clickCall = parentPostMessage.mock.calls.find(
      ([msg]) => msg?.type === "section_clicked",
    );
    expect(clickCall).toBeUndefined();
  });

  it("does NOT call preventDefault on ctrl/cmd click (lets user open links)", () => {
    mountBridge();
    const section = makeSection("sec-ctrl");
    const link = document.createElement("a");
    link.href = "https://example.com";
    section.appendChild(link);

    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    });
    link.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
    // But it still forwards the section_clicked so the editor knows.
    const clickCall = parentPostMessage.mock.calls.find(
      ([msg]) => msg?.type === "section_clicked",
    );
    expect(clickCall).toBeTruthy();
  });

  it("DOES call preventDefault on regular click", () => {
    mountBridge();
    const section = makeSection("sec-normal");
    const link = document.createElement("a");
    link.href = "https://example.com";
    section.appendChild(link);

    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
  });
});
