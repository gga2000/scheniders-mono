// =====================================================================
// PDP redesign 1a — Stars and CenteredSectionHeader, frozen
// =====================================================================
// `Stars` gains `precision` and `CenteredSectionHeader` gains
// `align: "reading"`. Every existing call passes neither, so these
// renders — the rounding path at 4.67 / 3 / 0 and both existing aligns —
// must stay byte-identical. A diff is a back-compat break, not a snapshot
// to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CenteredSectionHeader, Stars } from "./helpers/primitives";

describe("Stars baseline (rounding path)", () => {
  it.each([4.67, 3, 0])("value %s", (value) => {
    expect(renderToStaticMarkup(<Stars value={value} />)).toMatchSnapshot();
  });

  it("one star, small, with a label (the product card call)", () => {
    expect(
      renderToStaticMarkup(<Stars value={1} max={1} size={11} label="4.7 / 5" />),
    ).toMatchSnapshot();
  });
});

describe("CenteredSectionHeader baseline", () => {
  it("center: eyebrow with sparkle, title, subtitle, editor fields", () => {
    expect(
      renderToStaticMarkup(
        <CenteredSectionHeader
          eyebrow="ضمانات"
          glyph="sparkle"
          title="ليش تطلب منا؟"
          subtitle="كل طلب يوصلك مضمون"
          eyebrowField="eyebrow_i18n"
          titleField="heading_i18n"
          subtitleField="subheading_i18n"
        />,
      ),
    ).toMatchSnapshot();
  });

  it("start: title and subtitle", () => {
    expect(
      renderToStaticMarkup(
        <CenteredSectionHeader
          title="آراء الزبائن"
          subtitle="من طلبات حقيقية"
          align="start"
          titleField="heading_i18n"
        />,
      ),
    ).toMatchSnapshot();
  });

  it("h1, centered, title only", () => {
    expect(
      renderToStaticMarkup(<CenteredSectionHeader as="h1" title="المتجر" />),
    ).toMatchSnapshot();
  });
});
