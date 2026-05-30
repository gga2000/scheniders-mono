// =====================================================================
// SchneidersPreviewLiveRenderer — postMessage behavior tests
// =====================================================================
// Mounts the live renderer in jsdom, fakes `window.parent` so the
// component activates its listener, and drives the inbound message
// contract (page_config_update / runtime_update / page_id_change).
//
// We mock `@scheniders/sections` so each test asserts directly on
// what the renderer hands to `RenderSection` (section ids + runtime),
// independent of the actual section registry / Zod schemas.
// =====================================================================

/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type {
  PageConfig,
  RuntimeContext,
  SectionInstance,
} from "@scheniders/shared";

/* ─────────────────────────────────────────────────────────────────── */
/* RenderSection mock — exposes what the renderer passed in            */
/* ─────────────────────────────────────────────────────────────────── */

interface RenderSectionCall {
  instance: SectionInstance;
  runtime: RuntimeContext;
}

const renderSectionCalls: RenderSectionCall[] = [];

vi.mock("@scheniders/sections", () => ({
  RenderSection: ({
    instance,
    runtime,
  }: {
    instance: SectionInstance;
    runtime: RuntimeContext;
    renderCtx: unknown;
  }) => {
    renderSectionCalls.push({ instance, runtime });
    return React.createElement(
      "div",
      {
        "data-testid": "rs",
        "data-section-id": instance.id,
        "data-section-type": instance.type,
        "data-locale": runtime.locale,
        "data-breakpoint": runtime.breakpoint,
      },
      instance.id,
    );
  },
}));

import { SchneidersPreviewLiveRenderer } from "./schneiders-preview-live-renderer";

/* ─────────────────────────────────────────────────────────────────── */
/* Fixtures                                                             */
/* ─────────────────────────────────────────────────────────────────── */

function makeSection(id: string, type = "hero_image", enabled = true): SectionInstance {
  return {
    id,
    type,
    enabled,
    base: {},
  };
}

function makePage(sections: SectionInstance[]): PageConfig {
  return { page_id: "home", sections };
}

const INITIAL_PAGE: PageConfig = makePage([makeSection("s1"), makeSection("s2", "trust_strip")]);

const INITIAL_RUNTIME: RuntimeContext = {
  page_id: "home",
  breakpoint: "desktop",
  locale: "en",
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-05-15T00:00:00Z"),
};

const RENDER_CTX = {
  tenant: {} as never,
  products: [],
  categories: [],
};

/* ─────────────────────────────────────────────────────────────────── */
/* Harness                                                              */
/* ─────────────────────────────────────────────────────────────────── */

let container: HTMLDivElement;
let root: Root;
let originalParent: Window;
let originalLocation: Location;
let replaceMock: ReturnType<typeof vi.fn>;

function mount(): void {
  act(() => {
    root.render(
      <SchneidersPreviewLiveRenderer
        initialPageConfig={INITIAL_PAGE}
        initialRuntime={INITIAL_RUNTIME}
        renderCtx={RENDER_CTX}
      />,
    );
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
}

function fireEditorMessage(payload: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: payload }));
  });
}

beforeEach(() => {
  renderSectionCalls.length = 0;

  // Fake `window.parent` so the renderer's "in an iframe?" guard passes.
  originalParent = window.parent;
  Object.defineProperty(window, "parent", {
    configurable: true,
    get: () => ({}) as Window,
  });

  // Spy on `location.replace` — page_id_change calls it. jsdom's
  // navigation isn't implemented, so we shadow `window.location` with
  // a minimal stub.
  originalLocation = window.location;
  replaceMock = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, replace: replaceMock },
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  try {
    unmount();
  } catch {
    /* not mounted */
  }
  document.body.innerHTML = "";
  Object.defineProperty(window, "parent", {
    configurable: true,
    get: () => originalParent,
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.restoreAllMocks();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("SchneidersPreviewLiveRenderer", () => {
  it("renders initialPageConfig on mount", () => {
    mount();
    const nodes = container.querySelectorAll('[data-testid="rs"]');
    expect(nodes.length).toBe(2);
    expect(nodes[0].getAttribute("data-section-id")).toBe("s1");
    expect(nodes[1].getAttribute("data-section-id")).toBe("s2");
  });

  it("filters out disabled sections", () => {
    act(() => {
      root.render(
        <SchneidersPreviewLiveRenderer
          initialPageConfig={makePage([makeSection("a"), makeSection("b", "trust_strip", false)])}
          initialRuntime={INITIAL_RUNTIME}
          renderCtx={RENDER_CTX}
        />,
      );
    });
    const nodes = container.querySelectorAll('[data-testid="rs"]');
    expect(nodes.length).toBe(1);
    expect(nodes[0].getAttribute("data-section-id")).toBe("a");
  });

  it("re-renders with new sections on `page_config_update`", () => {
    mount();
    fireEditorMessage({
      source: "schn-editor",
      type: "page_config_update",
      payload: makePage([
        makeSection("new1"),
        makeSection("new2"),
        makeSection("new3", "trust_strip"),
      ]),
    });
    const nodes = container.querySelectorAll('[data-testid="rs"]');
    expect(nodes.length).toBe(3);
    expect(nodes[0].getAttribute("data-section-id")).toBe("new1");
    expect(nodes[2].getAttribute("data-section-id")).toBe("new3");
  });

  it("forwards new runtime locale on `runtime_update`", () => {
    mount();
    fireEditorMessage({
      source: "schn-editor",
      type: "runtime_update",
      payload: {
        page_id: "home",
        breakpoint: "mobile",
        locale: "ar",
        audience_segments: [],
        ab_test_arms: {},
        now: new Date("2026-06-01T00:00:00Z").toISOString(),
      },
    });
    const nodes = container.querySelectorAll('[data-testid="rs"]');
    expect(nodes[0].getAttribute("data-locale")).toBe("ar");
    expect(nodes[0].getAttribute("data-breakpoint")).toBe("mobile");
    // Last call's runtime.now is coerced back to a Date.
    const last = renderSectionCalls[renderSectionCalls.length - 1];
    expect(last.runtime.now instanceof Date).toBe(true);
  });

  it("calls `location.replace` on `page_id_change`", () => {
    mount();
    fireEditorMessage({
      source: "schn-editor",
      type: "page_id_change",
      next_url: "http://example.test/_preview/foo/product?token=x",
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      "http://example.test/_preview/foo/product?token=x",
    );
  });

  it("ignores messages with a non-schn-editor source", () => {
    mount();
    fireEditorMessage({
      source: "evil-frame",
      type: "page_config_update",
      payload: makePage([makeSection("nope")]),
    });
    const nodes = container.querySelectorAll('[data-testid="rs"]');
    expect(nodes.length).toBe(2);
    expect(nodes[0].getAttribute("data-section-id")).toBe("s1");
  });

  it("ignores `page_config_update` with malformed payload", () => {
    mount();
    fireEditorMessage({
      source: "schn-editor",
      type: "page_config_update",
      payload: { not_a: "page" },
    });
    const nodes = container.querySelectorAll('[data-testid="rs"]');
    expect(nodes.length).toBe(2);
  });

  it("does not attach a listener when not inside an iframe", () => {
    // Drop our `window.parent` stub so the renderer's iframe check fails.
    Object.defineProperty(window, "parent", {
      configurable: true,
      get: () => window,
    });
    mount();
    // Initial render still works.
    expect(container.querySelectorAll('[data-testid="rs"]').length).toBe(2);
    // But messages no-op.
    fireEditorMessage({
      source: "schn-editor",
      type: "page_config_update",
      payload: makePage([makeSection("ignored")]),
    });
    const nodes = container.querySelectorAll('[data-testid="rs"]');
    expect(nodes[0].getAttribute("data-section-id")).toBe("s1");
  });
});
