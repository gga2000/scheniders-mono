// The footer's policy links on a phone.
//
// Measured at 390px on the live store: eight links, each a 44px tap target
// with 2px between them, stacked full width — 368px of a 390px screen, in a
// footer that was 1,067px, 16% of the whole page. The height is the row
// count, not the row size, so the targets stay 44px and the rows halve.
// After: 923px. Verified in a browser; this pins the markup that does it.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import site_footer from "./site_footer";
import type { SectionRenderContext } from "./_types";

const ctx = {
  tenant: {
    id: "tenant-1",
    business_name: "متجر",
    store_config: { contact: { whatsapp_number: "07701234567" } },
  } as never,
  runtime: {
    page_id: "home" as const,
    breakpoint: "mobile" as const,
    locale: "ar" as const,
    audience_segments: [],
    ab_test_arms: {},
    now: new Date("2026-10-10T00:00:00Z"),
  },
  products: [],
  categories: [],
} as unknown as SectionRenderContext;

function render(): string {
  const Render = site_footer.render;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(Render, {
        props: { ...site_footer.defaultProps, layout: "info_panel" as const },
        ctx,
      }),
    ),
  );
}

/** The <ul> holding the flattened policy links. */
function linkList(html: string): string {
  const m = html.match(/<ul class="([^"]*grid-cols-2[^"]*|[^"]*space-y-0\.5[^"]*)"/);
  expect(m, "no link list in the footer markup").not.toBeNull();
  return m![1];
}

describe("site_footer — policy links on a phone", () => {
  it("pairs the links below sm and returns to one column above it", () => {
    const cls = linkList(render());
    expect(cls).toContain("grid-cols-2");
    // From `sm` up the footer is already a three-column grid; a second
    // column inside one of those columns would be too narrow.
    expect(cls).toContain("sm:block");
  });

  it("keeps every link a full tap target", () => {
    // min-h-11 is 44px. Halving the row count must not come out of the rows.
    //
    // Every anchor *inside the list* — not "every anchor that already has
    // the class", which is what the first version of this asserted, and
    // which stayed green when the class was deleted.
    const html = render();
    const start = html.search(/<ul class="[^"]*grid-cols-2/);
    expect(start, "no paired link list").toBeGreaterThan(-1);
    const list = html.slice(start, html.indexOf("</ul>", start));
    const anchors = list.match(/<a\b[^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThanOrEqual(4);
    for (const a of anchors) expect(a).toContain("min-h-11");
  });
});
