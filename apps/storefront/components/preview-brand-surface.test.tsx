/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EMPTY_BRAND_KIT, type BrandKit } from "@scheniders/shared";
import { PreviewBrandSurface } from "./preview-brand-surface";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let originalParent: Window;

const kitWith = (surface: string): BrandKit => ({
  ...EMPTY_BRAND_KIT,
  colors: { ...EMPTY_BRAND_KIT.colors, surface },
});

function surfaceVar(): string {
  const el = container.querySelector<HTMLElement>("[data-preview='true']");
  return el?.style.getPropertyValue("--bk-surface") ?? "";
}

function send(payload: unknown, origin = "http://localhost:3000"): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "schn-editor", type: "brand_kit_update", payload },
        origin,
      }),
    );
  });
}

beforeEach(() => {
  originalParent = window.parent;
  Object.defineProperty(window, "parent", { configurable: true, get: () => ({}) as Window });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <PreviewBrandSurface
        initialBrandKit={kitWith("#111111")}
        locale="ar"
        dataAttrs={{ "data-page-id": "home" }}
      >
        <p>child</p>
      </PreviewBrandSurface>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  Object.defineProperty(window, "parent", { configurable: true, get: () => originalParent });
});

describe("PreviewBrandSurface", () => {
  it("renders the server kit, the data attributes and the children", () => {
    expect(surfaceVar()).toBe("#111111");
    expect(container.querySelector("[data-page-id='home']")).toBeTruthy();
    expect(container.textContent).toContain("child");
  });

  it("re-themes in place when the editor sends a new kit", () => {
    send(kitWith("#222222"));
    expect(surfaceVar()).toBe("#222222");
  });

  it("ignores kits from an untrusted origin and malformed payloads", () => {
    send(kitWith("#333333"), "https://evil.example");
    send({ nope: true });
    expect(surfaceVar()).toBe("#111111");
  });
});
