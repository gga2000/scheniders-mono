import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Section, SectionHeader } from "./primitives";

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
