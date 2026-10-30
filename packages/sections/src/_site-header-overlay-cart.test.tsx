// @vitest-environment jsdom
// =====================================================================
// site_header overlay — the cart chip (`overlay_cart`, slice 1g)
// =====================================================================
// On the product page the header floats as glass chips; with overlay_cart
// (and show_cart) a cart chip sits beside the menu chip: the bag, the
// live count once mounted, a link to the cart. The count pops when the
// shopper adds — never when the saved cart loads. Without the prop the
// overlay renders exactly as before (_site-header-overlay-baseline).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import type { CartItem } from "@scheniders/shared";
import { CART_BUMP_MS } from "./helpers/cart-bump";
import { useCart } from "./helpers/cart-store";
import { StoreBaseProvider } from "./helpers/store-context";
import site_header, { type Props } from "./site_header";
import { SIGNATURE_HEADER_PROPS, productCtx, saleProduct } from "./_pdp-fixtures";

const OVERLAY: Props = { ...SIGNATURE_HEADER_PROPS, sticky: false, surface: "overlay" };
const WITH_CART: Props = { ...OVERLAY, show_cart: true, overlay_cart: true };

const LINE: CartItem = {
  product_id: saleProduct.id,
  variant_id: null,
  name: "ويفر انتنس",
  variant_name: null,
  price: 25000,
  quantity: 1,
  image_url: null,
  base_price: 25000,
};

function Header({ props }: { props: Props }) {
  return (
    <StoreBaseProvider base="/s/fixture-store">
      <site_header.render props={props} ctx={productCtx(saleProduct)} />
    </StoreBaseProvider>
  );
}

beforeEach(() => {
  useCart.setState({ items: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("overlay_cart prop", () => {
  it("parses true; a bad stored value degrades to absent", () => {
    expect(site_header.schema.parse(WITH_CART).overlay_cart).toBe(true);
    expect(site_header.schema.parse({ ...WITH_CART, overlay_cart: 1 }).overlay_cart).toBeUndefined();
  });

  it("server markup: a cart chip to /cart named with a zero count, beside the menu", () => {
    const html = renderToStaticMarkup(<Header props={WITH_CART} />);
    expect(html).toContain('href="/s/fixture-store/cart"');
    expect(html).toContain('aria-label="سلة التسوّق (0)"');
    expect(html).toContain("data-header-cart");
    expect(html).not.toContain("data-cart-count");
    expect(html.indexOf("data-header-cart")).toBeLessThan(html.indexOf('aria-label="القائمة"'));
    expect(html).not.toContain(' dir="');
  });

  it("needs show_cart: the overlay stays chip-less without it", () => {
    const html = renderToStaticMarkup(<Header props={{ ...OVERLAY, overlay_cart: true }} />);
    expect(html).not.toContain("data-header-cart");
    expect(html).toBe(renderToStaticMarkup(<Header props={OVERLAY} />));
  });
});

describe("the cart chip in the browser", () => {
  it("shows the live count once mounted", () => {
    useCart.setState({ items: [{ ...LINE, quantity: 2 }] });
    const view = render(<Header props={WITH_CART} />);
    expect(view.container.querySelector("[data-cart-count]")?.textContent).toBe("2");
    expect(view.container.querySelector("[data-header-cart]")?.getAttribute("aria-label")).toBe("سلة التسوّق (2)");
  });

  it("pops on an add, then settles", () => {
    vi.useFakeTimers();
    vi.spyOn(useCart.persist, "hasHydrated").mockReturnValue(true);
    const view = render(<Header props={WITH_CART} />);
    act(() => useCart.getState().addItem(LINE));
    const badge = () => view.container.querySelector("[data-cart-count]");
    expect(badge()?.textContent).toBe("1");
    expect(badge()?.className).toContain("scale-125");
    act(() => vi.advanceTimersByTime(CART_BUMP_MS));
    expect(badge()?.className).not.toContain("scale-125");
  });

  it("does not pop when the saved cart arrives after mount", () => {
    vi.spyOn(useCart.persist, "hasHydrated").mockReturnValue(false);
    const view = render(<Header props={WITH_CART} />);
    act(() => useCart.setState({ items: [{ ...LINE, quantity: 3 }] }));
    const badge = view.container.querySelector("[data-cart-count]");
    expect(badge?.textContent).toBe("3");
    expect(badge?.className).not.toContain("scale-125");
  });
});
