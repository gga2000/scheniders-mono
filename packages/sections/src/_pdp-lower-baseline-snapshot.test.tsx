// =====================================================================
// T0 — the PDP's lower sections, frozen BEFORE the opt-in fields
// =====================================================================
// faq_contact_split (cards, ledger, scheniders-iraq's live PDP FAQ) and
// accordion_richtext's quiet layout (scheniders-iraq's live PDP policies)
// as server markup. Written before `compact` (faq_contact_split) and
// `call_row` (accordion_richtext) existed; with neither set, the markup
// must stay byte-identical. A diff here is a back-compat break, not a
// snapshot to refresh. Never run this file with -u.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import faq_contact_split from "./faq_contact_split";
import {
  BARE_TENANT,
  IRAQ_TENANT,
  LIVE_PDP_FAQ,
  LIVE_PDP_POLICIES,
  lowerCtx,
  type AccordionProps,
  type FaqProps,
} from "./_pdp-lower-fixtures";
import type { Tenant } from "./types";

function renderFaq(props: FaqProps, locale: LocaleCode, tenant: Tenant = IRAQ_TENANT): string {
  const Render = faq_contact_split.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={lowerCtx(locale, tenant)} />
    </StoreBaseProvider>,
  );
}

function renderAccordion(props: AccordionProps, locale: LocaleCode, tenant: Tenant = IRAQ_TENANT): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={lowerCtx(locale, tenant)} />
    </StoreBaseProvider>,
  );
}

describe("faq_contact_split — frozen", () => {
  const cards = faq_contact_split.defaultProps;

  it("defaultProps ar", () => {
    expect(renderFaq(cards, "ar")).toMatchSnapshot();
  });

  it("defaultProps en", () => {
    expect(renderFaq(cards, "en")).toMatchSnapshot();
  });

  it("defaultProps ledger ar", () => {
    expect(renderFaq({ ...cards, layout: "ledger" }, "ar")).toMatchSnapshot();
  });

  it("LIVE_PDP_FAQ ar", () => {
    expect(renderFaq(LIVE_PDP_FAQ, "ar")).toMatchSnapshot();
  });

  it("LIVE_PDP_FAQ en", () => {
    expect(renderFaq(LIVE_PDP_FAQ, "en")).toMatchSnapshot();
  });

  it("LIVE_PDP_FAQ ar, no contact number anywhere", () => {
    expect(renderFaq(LIVE_PDP_FAQ, "ar", BARE_TENANT)).toMatchSnapshot();
  });
});

describe("accordion_richtext quiet — frozen", () => {
  it("LIVE_PDP_POLICIES ar", () => {
    expect(renderAccordion(LIVE_PDP_POLICIES, "ar")).toMatchSnapshot();
  });

  it("LIVE_PDP_POLICIES en", () => {
    expect(renderAccordion(LIVE_PDP_POLICIES, "en")).toMatchSnapshot();
  });

  it("LIVE_PDP_POLICIES ar with a heading", () => {
    expect(
      renderAccordion(
        { ...LIVE_PDP_POLICIES, heading_i18n: { ar: "ضماناتك", en: "Our promise" } },
        "ar",
      ),
    ).toMatchSnapshot();
  });

  it("LIVE_PDP_POLICIES ar, no contact number anywhere", () => {
    expect(renderAccordion(LIVE_PDP_POLICIES, "ar", BARE_TENANT)).toMatchSnapshot();
  });
});
