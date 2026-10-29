// Express `color_lock` (spec §1.2, D4): solid yellow belongs to the two
// order actions only, and green to WhatsApp and success states. With the
// lock on, the paid price and the free-delivery words are ink, and the
// discount seal, the clock digits, its dot and its bar use the espresso
// partner colour. Without it the markup is today's (pinned by the
// express baselines).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant, productCtx, saleProduct } from "../_pdp-fixtures";
import type { Tenant } from "../types";

/** Free delivery everywhere, so the receipt prints «مجاني لكل المحافظات». */
const freeTenant: Tenant = {
  ...fixtureTenant,
  store_config_v2: { commerce: { shipping: { default_rate: { fee_iqd: 0 } } }, enabled_locales: ["ar"] },
};

function render(props: Props): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render props={props} ctx={productCtx(saleProduct, { tenant: freeTenant })} />
    </StoreBaseProvider>,
  );
}

/** The whole element whose opening tag carries `marker`, by tag balance. */
function elementHtml(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const name = /^<([a-z0-9]+)/.exec(html.slice(start))?.[1] ?? "";
  let depth = 0;
  const re = new RegExp(`<${name}[\\s>]|</${name}>`, "g");
  re.lastIndex = start;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

const unlocked = render(EXPRESS_IRAQ_DRAFT_PDP_PROPS);
const locked = render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, color_lock: true });

describe("express color_lock", () => {
  it("today: green paid price, yellow seal and clock, green free-delivery words", () => {
    expect(elementHtml(unlocked, "data-price-row")).toContain("var(--bk-success) 38%");
    expect(elementHtml(unlocked, "data-price-row")).toContain("text-bk-primary");
    expect(elementHtml(unlocked, 'role="timer"')).toContain("text-bk-primary");
    expect(elementHtml(unlocked, 'role="timer"')).toContain("bg-bk-primary");
    expect(elementHtml(unlocked, "data-delivery-fee")).toContain("text-bk-success");
  });

  it("locked: the paid price is ink and the seal uses the espresso partner colour", () => {
    const plate = elementHtml(locked, "data-price-row");
    expect(plate).not.toContain("--bk-success");
    expect(plate).toContain("color:var(--bk-ink)");
    expect(plate).not.toContain("text-bk-primary");
    expect(plate).toContain("text-bk-on-secondary");
  });

  it("locked: the clock digits, dot and bar use the espresso partner colour", () => {
    const clock = elementHtml(locked, 'role="timer"');
    expect(clock).not.toContain("text-bk-primary");
    expect(clock).not.toContain("bg-bk-primary");
    expect(clock).toContain("bg-bk-on-secondary/60");
  });

  it("locked: the free-delivery words are ink", () => {
    const fee = elementHtml(locked, "data-delivery-fee");
    expect(fee).not.toContain("text-bk-success");
    expect(fee).toContain("مجاني لكل المحافظات");
  });

  it("locked: the submit keeps its yellow fill", () => {
    expect(locked).toContain("bg-bk-primary px-5 text-bk-on-primary");
  });
});
