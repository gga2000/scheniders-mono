// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render } from "@testing-library/react";
import { ICON_FONT_FULL_HREF, ICON_FONT_SUBSET_HREF, ICON_NAMES, isListedIcon } from "./icon-names";
import { MaterialIcon } from "./primitives";

describe("icon font subset", () => {
  it("is sorted A-Z and has no duplicates (Google Fonts requires sorted icon_names)", () => {
    expect([...ICON_NAMES]).toEqual([...new Set(ICON_NAMES)].sort());
  });

  it("keeps the subset URL small and the full URL free of icon_names", () => {
    expect(ICON_FONT_SUBSET_HREF).toContain("icon_names=");
    expect(ICON_FONT_FULL_HREF).not.toContain("icon_names");
  });

  it("covers the icons the default product page and trust rows use", () => {
    for (const n of ["payments", "verified", "local_shipping", "support_agent", "workspace_premium", "undo", "visibility", "expand_more", "sunny", "ac_unit"]) {
      expect(isListedIcon(n), n).toBe(true);
    }
  });

  it("renders a listed icon with no fallback loader and an unlisted one with it", () => {
    const listed = renderToStaticMarkup(<MaterialIcon name="payments" />);
    expect(listed).toContain("payments");
    const unlisted = renderToStaticMarkup(<MaterialIcon name="rocket_launch" />);
    expect(unlisted).toContain("rocket_launch");
    expect(isListedIcon("rocket_launch")).toBe(false);
  });

  it("loads the full font once when an unlisted icon draws, and never for listed ones", () => {
    document.head.querySelector("#bk-icon-font-full")?.remove();
    render(<MaterialIcon name="payments" />);
    expect(document.getElementById("bk-icon-font-full")).toBeNull();
    cleanup();
    render(
      <>
        <MaterialIcon name="rocket_launch" />
        <MaterialIcon name="rocket_launch" />
      </>,
    );
    const links = document.head.querySelectorAll("#bk-icon-font-full");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(ICON_FONT_FULL_HREF);
    cleanup();
  });
});
