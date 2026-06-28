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
        origin: "http://localhost:3000",
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
        origin: "http://localhost:3000",
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
        origin: "http://localhost:3000",
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
        origin: "http://localhost:3000",
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

  it("ignores inbound messages from an untrusted origin (EC25)", () => {
    mountBridge();
    const section = makeSection("guarded-section");
    const spy = vi.fn();
    section.scrollIntoView = spy as unknown as typeof section.scrollIntoView;

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.example.com",
        data: {
          source: "schn-editor",
          type: "scroll_to_section",
          section_id: "guarded-section",
        },
      }),
    );

    expect(spy).not.toHaveBeenCalled();
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

  /* ───── Selection sync + inline edit (BUG1 affordance parity) ───── */

  function selectSection(id: string | null): void {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://localhost:3000",
        data: {
          source: "schn-editor",
          type: "set_selected_section",
          section_id: id,
        },
      }),
    );
  }

  function makeField(section: HTMLElement, field: string, text: string): HTMLElement {
    const el = document.createElement("h2");
    el.setAttribute("data-i18n-field", field);
    el.textContent = text;
    section.appendChild(el);
    return el;
  }

  it("toggles data-selected-section on set_selected_section", () => {
    mountBridge();
    const section = makeSection("sel-1");
    selectSection("sel-1");
    expect(section.getAttribute("data-selected-section")).toBe("true");
    selectSection(null);
    expect(section.hasAttribute("data-selected-section")).toBe(false);
  });

  it("single-click on editable text inside the SELECTED section enters inline edit", () => {
    mountBridge();
    const section = makeSection("edit-sec");
    const field = makeField(section, "headline.title", "Old");
    selectSection("edit-sec");
    parentPostMessage.mockClear();

    field.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(field.getAttribute("contenteditable")).toBe("true");
    const begin = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "inline_edit_begin",
    );
    expect(begin?.[0]).toMatchObject({
      source: "schn-preview",
      type: "inline_edit_begin",
      section_id: "edit-sec",
    });
    // It must NOT also post a section_clicked navigation.
    const clicked = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "section_clicked",
    );
    expect(clicked).toBeUndefined();
  });

  it("does NOT enter inline edit when the field's section is not selected", () => {
    mountBridge();
    const section = makeSection("other-sec");
    const field = makeField(section, "headline.title", "Old");
    // No selection set → click falls through to section_clicked.
    parentPostMessage.mockClear();

    field.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(field.hasAttribute("contenteditable")).toBe(false);
    const clicked = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "section_clicked",
    );
    expect(clicked?.[0]).toMatchObject({ section_id: "other-sec" });
  });

  it("commits the edited value and ends on Enter", () => {
    mountBridge();
    const section = makeSection("commit-sec");
    const field = makeField(section, "headline.title", "Old");
    selectSection("commit-sec");
    field.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    parentPostMessage.mockClear();

    field.textContent = "New Heading";
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    const commit = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "inline_edit_commit",
    );
    expect(commit?.[0]).toMatchObject({
      section_id: "commit-sec",
      field_path: "headline.title",
      value: "New Heading",
    });
    const end = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "inline_edit_end",
    );
    expect(end?.[0]).toMatchObject({ reverted: false });
    expect(field.hasAttribute("contenteditable")).toBe(false);
  });

  it("reverts the value and ends (no commit) on Escape", () => {
    mountBridge();
    const section = makeSection("revert-sec");
    const field = makeField(section, "headline.title", "Original");
    selectSection("revert-sec");
    field.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    parentPostMessage.mockClear();

    field.textContent = "scratch edit";
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(field.textContent).toBe("Original");
    const commit = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "inline_edit_commit",
    );
    expect(commit).toBeUndefined();
    const end = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "inline_edit_end",
    );
    expect(end?.[0]).toMatchObject({ reverted: true });
  });

  it("responds to request_all_rects with every section rect", () => {
    mountBridge();
    makeSection("rects-a");
    makeSection("rects-b");
    parentPostMessage.mockClear();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://localhost:3000",
        data: { source: "schn-editor", type: "request_all_rects" },
      }),
    );

    const all = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "all_rects",
    );
    expect(all?.[0].rects).toHaveLength(2);
    expect(all?.[0].rects.map((r: { section_id: string }) => r.section_id)).toEqual(
      ["rects-a", "rects-b"],
    );
  });

  it("posts section_context_menu on right-click", () => {
    mountBridge();
    const section = makeSection("ctx-sec");
    parentPostMessage.mockClear();

    section.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 240,
      }),
    );

    const ctx = parentPostMessage.mock.calls.find(
      ([m]) => m?.type === "section_context_menu",
    );
    expect(ctx?.[0]).toMatchObject({
      source: "schn-preview",
      type: "section_context_menu",
      section_id: "ctx-sec",
      x: 120,
      y: 240,
    });
  });
});
