import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CenteredSectionHeader, Section, SectionHeader, Stars } from "./primitives";
import { displayRating } from "./format";

describe("Section primitive", () => {
  it("applies horizontal padding + default section rhythm", () => {
    const html = renderToStaticMarkup(<Section>hi</Section>);
    expect(html).toMatch(/px-4/);
    expect(html).toMatch(/py-bk-section/);
    expect(html).toContain("hi");
  });

  it("supports dense + generous density", () => {
    expect(renderToStaticMarkup(<Section density="dense">x</Section>)).toMatch(
      /py-bk-section-dense/,
    );
    expect(
      renderToStaticMarkup(<Section density="generous">x</Section>),
    ).toMatch(/py-bk-section-generous/);
  });

  it("bleed drops horizontal padding for full-width sections", () => {
    const html = renderToStaticMarkup(<Section bleed>x</Section>);
    expect(html).not.toMatch(/px-4/);
  });
});

describe("SectionHeader primitive", () => {
  it("renders the title and an optional subtitle", () => {
    const html = renderToStaticMarkup(
      <SectionHeader title="Featured" subtitle="Hand-picked" />,
    );
    expect(html).toContain("Featured");
    expect(html).toContain("Hand-picked");
    expect(html).toMatch(/mb-bk-lg/);
  });

  it("omits the subtitle node when not provided", () => {
    const html = renderToStaticMarkup(<SectionHeader title="Only title" />);
    expect(html).toContain("Only title");
    expect(html).not.toMatch(/mt-bk-xs/);
  });
});

/** Fill widths of an exact `Stars` render, in star order. */
function fillWidths(html: string): string[] {
  return [...html.matchAll(/style="width:(\d+)%"/g)].map((m) => m[1] ?? "");
}

describe("Stars precision", () => {
  it('defaults to "round": no precision and precision="round" render the same', () => {
    expect(renderToStaticMarkup(<Stars value={4.67} />)).toBe(
      renderToStaticMarkup(<Stars value={4.67} precision="round" />),
    );
  });

  it("exact at displayRating(4.667) = 4.7 draws four full stars and a 70% fifth", () => {
    const html = renderToStaticMarkup(
      <Stars value={displayRating(4.667)} precision="exact" />,
    );
    expect(fillWidths(html)).toEqual(["100", "100", "100", "100", "70"]);
    expect(html).toContain('aria-label="4.7 / 5"');
    // Every star keeps its outline, filled or not.
    expect(html.match(/stroke-bk-accent/g)).toHaveLength(5);
  });

  it("exact draws no fill layer for an empty star", () => {
    const html = renderToStaticMarkup(<Stars value={2.5} precision="exact" />);
    expect(fillWidths(html)).toEqual(["100", "100", "50"]);
    expect(html.match(/fill-bk-accent/g)).toHaveLength(3);
  });

  it("exact clamps to 0..max", () => {
    expect(fillWidths(renderToStaticMarkup(<Stars value={7} precision="exact" />))).toEqual([
      "100", "100", "100", "100", "100",
    ]);
    const empty = renderToStaticMarkup(<Stars value={-1} precision="exact" />);
    expect(fillWidths(empty)).toEqual([]);
    // Clamped to zero, not dropped: all five outlines still draw.
    expect(empty.match(/stroke-bk-accent/g)).toHaveLength(5);
  });

  it("exact keeps the caller's size and label", () => {
    const html = renderToStaticMarkup(
      <Stars value={3} precision="exact" size={12} label="3 من 5" />,
    );
    expect(html).toContain('aria-label="3 من 5"');
    expect(html).toContain('width="12"');
  });
});

describe('CenteredSectionHeader align="reading"', () => {
  it("aligns to the right edge for Arabic and Kurdish", () => {
    for (const locale of ["ar", "ku"] as const) {
      const html = renderToStaticMarkup(
        <CenteredSectionHeader title="عنوان" align="reading" locale={locale} />,
      );
      expect(html).toContain("items-end text-right");
    }
  });

  it("aligns to the left edge for English", () => {
    const html = renderToStaticMarkup(
      <CenteredSectionHeader title="Title" align="reading" locale="en" />,
    );
    expect(html).toContain("items-start text-left");
  });

  it('renders like "start" when no locale is given', () => {
    expect(
      renderToStaticMarkup(<CenteredSectionHeader title="عنوان" align="reading" />),
    ).toBe(renderToStaticMarkup(<CenteredSectionHeader title="عنوان" align="start" />));
  });
});
