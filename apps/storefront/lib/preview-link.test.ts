import { describe, expect, it } from "vitest";
import { draftViewUrlForPreviewLink } from "./preview-link";

const preview = {
  origin: "https://www.scheniders.com",
  pathname: "/_preview/scheniders-iraq/home",
  search: "?token=tok123&breakpoint=desktop",
};

function to(url: string | null): string | null {
  if (!url) return null;
  return new URLSearchParams(url.split("?")[1]).get("to");
}

describe("draftViewUrlForPreviewLink", () => {
  it("opens a category link on the real store page through draft view", () => {
    const url = draftViewUrlForPreviewLink("/_preview/scheniders-iraq/categories/work", preview, "scheniders-iraq");
    expect(url?.startsWith("/api/draft-view?")).toBe(true);
    const q = new URLSearchParams(url?.split("?")[1]);
    expect(q.get("tenant")).toBe("scheniders-iraq");
    expect(q.get("token")).toBe("tok123");
    expect(q.get("to")).toBe("/categories/work");
  });

  it("keeps query and hash, and maps the bare base to the home page", () => {
    expect(to(draftViewUrlForPreviewLink("/_preview/scheniders-iraq/products?cat=men#top", preview, "scheniders-iraq"))).toBe(
      "/products?cat=men#top",
    );
    expect(to(draftViewUrlForPreviewLink("/_preview/scheniders-iraq", preview, "scheniders-iraq"))).toBe("/");
  });

  it("keeps non-Latin product slugs intact", () => {
    expect(to(draftViewUrlForPreviewLink("/_preview/scheniders-iraq/products/بستاشيو", preview, "scheniders-iraq"))).toBe(
      "/products/%D8%A8%D8%B3%D8%AA%D8%A7%D8%B4%D9%8A%D9%88",
    );
  });

  it("leaves outside links alone", () => {
    expect(draftViewUrlForPreviewLink("https://wa.me/9647700000000", preview, "scheniders-iraq")).toBeNull();
    expect(draftViewUrlForPreviewLink("tel:+9647700000000", preview, "scheniders-iraq")).toBeNull();
    expect(draftViewUrlForPreviewLink("/_preview/other-shop/home", preview, "scheniders-iraq")).toBeNull();
    expect(draftViewUrlForPreviewLink("/_preview/scheniders-iraqx/home", preview, "scheniders-iraq")).toBeNull();
  });

  it("needs a token and a tenant", () => {
    expect(draftViewUrlForPreviewLink("/_preview/scheniders-iraq/about", { ...preview, search: "" }, "scheniders-iraq")).toBeNull();
    expect(draftViewUrlForPreviewLink("/_preview/scheniders-iraq/about", preview, null)).toBeNull();
  });
});
