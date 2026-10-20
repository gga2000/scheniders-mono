// article_index (W7.6) — the way into a store's guides.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import article_index from "./article_index";
import type { SectionRenderContext } from "./_types";
import type { ArticleSummary } from "@scheniders/shared";

type Props = typeof article_index.defaultProps;

const article = (over: Partial<ArticleSummary> & { id: string; slug: string }): ArticleSummary => ({
  title: { en: "A guide", ar: "دليل" },
  ...over,
});

function render(
  props: Partial<Props> = {},
  articles: ArticleSummary[] = [],
  base = "",
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base, children: null },
      React.createElement(article_index.render, {
        props: { ...article_index.defaultProps, ...props },
        ctx: {
          tenant: { id: "t", business_name: "متجر", store_config: {} },
          runtime: {
            page_id: "home",
            breakpoint: "mobile",
            locale: "ar",
            audience_segments: [],
            ab_test_arms: {},
            now: new Date("2026-09-11T00:00:00Z"),
          },
          products: [],
          categories: [],
          articles,
        } as unknown as SectionRenderContext,
      }),
    ),
  );
}

describe("article_index — nothing to show", () => {
  it("renders nothing when the store has no guides", () => {
    // An empty "Guides" heading over blank space is worse than no section,
    // and a merchant who has written none shouldn't have to remove it.
    expect(render({}, [])).toBe("");
  });

  it("renders nothing when the context carries no articles at all", () => {
    expect(render({})).toBe("");
  });
});

describe("article_index — the cards", () => {
  const three = [
    article({ id: "1", slug: "first", published_at: "2026-09-01" }),
    article({ id: "2", slug: "second", published_at: "2026-08-01" }),
    article({ id: "3", slug: "third", published_at: "2026-07-01" }),
  ];

  it("links each card to the article's own page", () => {
    expect(render({}, three)).toContain('href="/p/first"');
  });

  it("prefixes the store base in path mode", () => {
    expect(render({}, three, "/s/my-store")).toContain('href="/s/my-store/p/first"');
  });

  it("shows the list in the order it was given", () => {
    const html = render({}, three);
    expect(html.indexOf("/p/first")).toBeLessThan(html.indexOf("/p/second"));
  });

  it("honours the limit and leaves the rest to their own URLs", () => {
    const html = render({ limit: 2 }, three);
    expect(html).toContain("/p/first");
    expect(html).not.toContain("/p/third");
  });

  it("writes the date in the store's language, with Latin digits", () => {
    const html = render({}, three);
    expect(html).toContain("أيلول");
    expect(html).not.toMatch(/[٠-٩]/);
  });

  it("carries a machine-readable date beside the human one", () => {
    // React's server renderer writes the attribute as `dateTime`; HTML parses
    // attribute names case-insensitively, so the DOM ends up with `datetime`.
    expect(render({}, three)).toMatch(/datetime="2026-09-01"/i);
  });

  it("omits the date when the merchant turned it off", () => {
    expect(render({ show_date: false }, three)).not.toContain("أيلول");
  });

  it("shows an excerpt only when there is one", () => {
    const withText = [article({ id: "1", slug: "a", excerpt: { ar: "مقدمة قصيرة", en: "x" } })];
    expect(render({}, withText)).toContain("مقدمة قصيرة");
    expect(render({ show_excerpt: false }, withText)).not.toContain("مقدمة قصيرة");
  });

  it("shows a cover only when there is one", () => {
    const withCover = [article({ id: "1", slug: "a", cover_url: "https://cdn.example.com/c.jpg" })];
    expect(render({}, withCover)).toContain("c.jpg");
    expect(render({}, [article({ id: "1", slug: "a" })])).not.toContain("<img");
    expect(render({ show_cover: false }, withCover)).not.toContain("c.jpg");
  });

  it("never invents a byline", () => {
    // An author is the merchant's to name; the store name is not a person.
    expect(render({}, [article({ id: "1", slug: "a" })])).not.toContain("متجر");
    expect(render({}, [article({ id: "1", slug: "a", author: "علي" })])).toContain("علي");
  });

  it("loads covers lazily — a guides list is rarely the first thing read", () => {
    const withCover = [article({ id: "1", slug: "a", cover_url: "https://cdn.example.com/c.jpg" })];
    expect(render({}, withCover)).toContain('loading="lazy"');
  });
});

describe("article_index — the schema", () => {
  it("parses its own defaults", () => {
    expect(article_index.schema.safeParse(article_index.defaultProps).success).toBe(true);
  });

  it("refuses a limit outside the range the editor offers", () => {
    expect(article_index.schema.safeParse({ ...article_index.defaultProps, limit: 0 }).success).toBe(false);
    expect(article_index.schema.safeParse({ ...article_index.defaultProps, limit: 99 }).success).toBe(false);
  });
});
