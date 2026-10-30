// @vitest-environment jsdom
// trust_strip `style: "soft"` (slice 1h): every pill on screen at 360px —
// quiet tiles two a row from the reading start, wrapping instead of
// scrolling sideways, ink only. "chunky" renders exactly like absent.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import trust_strip from "./trust_strip";
import { IRAQ_DRAFT_TRUST_BASE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore } from "./_cart-checkout-test-utils";

afterEach(cleanup);

const BASE = trust_strip.schema.parse(IRAQ_DRAFT_TRUST_BASE);
const SOFT = { ...BASE, style: "soft" as const };

function markup(props: typeof BASE, locale: "ar" | "en" = "ar") {
  const Strip = trust_strip.render;
  return mountInStore(<Strip props={props} ctx={pageCtx("cart", locale)} />).container;
}

describe("trust_strip style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(trust_strip.schema.parse({ ...IRAQ_DRAFT_TRUST_BASE, style: "soft" }).style).toBe("soft");
    const bad = trust_strip.schema.parse({ ...IRAQ_DRAFT_TRUST_BASE, style: "neon" });
    expect(bad.style).toBeUndefined();
    expect(bad.pills).toHaveLength(4);
  });

  it("chunky renders exactly like absent", () => {
    const absent = html(markup(BASE));
    cleanup();
    expect(html(markup({ ...BASE, style: "chunky" }))).toBe(absent);
  });
});

describe("trust_strip soft", () => {
  it("wraps two a row from the right in Arabic; never scrolls sideways", () => {
    const view = markup(SOFT);
    const list = view.querySelector("ul");
    expect(list?.className).toContain("flex-wrap");
    expect(list?.className).toContain("flex-row-reverse");
    expect(list?.className).not.toContain("overflow-x-auto");
    const tiles = [...view.querySelectorAll("li")];
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.className).toContain("grow basis-[calc(50%-0.25rem)]");
      expect(tile.className).toContain("min-h-11");
    }
  });

  it("English reads from the left", () => {
    expect(markup(SOFT, "en").querySelector("ul")?.className).not.toContain("flex-row-reverse");
  });

  it("ink only: no tint, no outline, no yellow, no colour literal, no dir", () => {
    const view = markup(SOFT);
    expectSoftRules(view.innerHTML, 0);
    expect(view.innerHTML).not.toContain("color-mix");
    expect(view.querySelector('[data-i18n-field="pills[1].label_i18n"]')?.textContent).toBe(
      "توصيل مجاني لكل المحافظات",
    );
  });
});
