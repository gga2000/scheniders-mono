// =====================================================================
// site_header overlay surface — frozen before slice 1g
// =====================================================================
// Server markup of the overlay header (floating_pill + surface "overlay")
// as it renders on scheniders-iraq's draft product page today, and with
// the section defaults (show_cart true, which the overlay has never
// honoured). Slice 1g adds an opt-in cart chip (`overlay_cart`); without
// it these renders must stay byte-identical. A diff is a back-compat
// break, not a snapshot to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import site_header, { type Props } from "./site_header";
import type { Tenant } from "./types";
import { SIGNATURE_HEADER_PROPS, fixtureTenant, productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";

const bilingualTenant: Tenant = {
  ...fixtureTenant,
  store_config_v2: { enabled_locales: ["ar", "en"] },
};

/** The draft's product-page variant: the base with sticky off and the
 *  overlay surface (variant 4c9e2b71, read 2026-10-30). */
const IRAQ_PRODUCT_HEADER: Props = { ...SIGNATURE_HEADER_PROPS, sticky: false, surface: "overlay" };
const DEFAULTS_OVERLAY: Props = { ...site_header.defaultProps, layout: "floating_pill", surface: "overlay" };

function render(props: Props, locale: LocaleCode): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <site_header.render
        props={props}
        ctx={productCtx(saleProduct, { tenant: bilingualTenant, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

describe("site_header overlay baseline", () => {
  it.each(["ar", "en"] as const)("scheniders-iraq product header, %s", (locale) => {
    expect(render(IRAQ_PRODUCT_HEADER, locale)).toMatchSnapshot();
  });

  it.each(["ar", "en"] as const)("defaults with the overlay surface, %s", (locale) => {
    expect(render(DEFAULTS_OVERLAY, locale)).toMatchSnapshot();
  });
});
