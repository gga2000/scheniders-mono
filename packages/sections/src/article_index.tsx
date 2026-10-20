// =====================================================================
// Section — article_index
// =====================================================================
// Lists the store's guides, newest first. Each card links to the article's
// own page at `/p/<slug>`, which is an ordinary merchant-authored custom
// page — so a guide is written with the same editor, the same sections and
// the same preview as any other page, and this section is only the way in.
//
// The list arrives through the render context, resolved upstream, for the
// same reason products do: a section receives a pruned tenant so an index of
// twenty guides never serialises twenty section trees into the payload of
// the page that merely lists them.
//
// Renders nothing when the store has no published guides. An empty "Guides"
// heading over blank space is worse than the section not being there, and a
// merchant who has written none should not have to remember to remove it.
// =====================================================================

import { z } from "zod";
import { resolveI18n, formatArticleDate } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import { BentoCard, Section, SectionHeader } from "./helpers/primitives";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  intro_i18n: i18nStringOptional,
  /** How many cards to show. The rest stay reachable by their own URLs. */
  limit: z.number().int().min(1).max(24),
  layout: z.enum(["grid", "list"]),
  show_date: z.boolean(),
  show_excerpt: z.boolean(),
  show_cover: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Guides", ar: "أدلة ونصائح" },
  intro_i18n: undefined,
  limit: 6,
  layout: "grid",
  show_date: true,
  show_excerpt: true,
  show_cover: true,
};

function ArticleIndex({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const articles = (ctx.articles ?? []).slice(0, props.limit);
  if (articles.length === 0) return null;

  const heading = resolveI18n(props.heading_i18n, locale);
  const intro = resolveI18n(props.intro_i18n, locale);

  return (
    <Section>
      {heading && <SectionHeader title={heading} color="pink" />}
      {intro && (
        <p className="mb-bk-md font-body text-sm sm:text-base text-bk-ink/70 max-w-2xl">
          {intro}
        </p>
      )}
      <ul
        className={
          props.layout === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-bk-md"
            : "flex flex-col gap-bk-sm"
        }
      >
        {articles.map((article) => {
          const title = resolveI18n(article.title, locale);
          const excerpt = resolveI18n(article.excerpt, locale);
          const date = props.show_date
            ? formatArticleDate(article.published_at, locale)
            : "";
          return (
            <li key={article.id}>
              <StoreLink href={`/p/${article.slug}`} className="block h-full">
                <BentoCard
                  size="sm"
                  className="h-full overflow-hidden p-0 flex flex-col"
                >
                  {props.show_cover && article.cover_url && (
                    <div className="relative w-full aspect-[16/9] bg-bk-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a
                          merchant cover can be any host; sections must not
                          depend on the app's image allowlist. */}
                      <img
                        src={article.cover_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-bk-2xs p-bk-sm">
                    {date && (
                      <time
                        dateTime={article.published_at}
                        className="font-label text-xs text-bk-ink/50"
                      >
                        {date}
                      </time>
                    )}
                    {title && (
                      <h3 className="font-display font-black text-base sm:text-lg leading-tight text-bk-ink">
                        {title}
                      </h3>
                    )}
                    {props.show_excerpt && excerpt && (
                      <p className="font-body text-sm text-bk-ink/70 line-clamp-3">
                        {excerpt}
                      </p>
                    )}
                    {article.author && (
                      <span className="mt-auto pt-bk-2xs font-label text-xs text-bk-ink/50">
                        {article.author}
                      </span>
                    )}
                  </div>
                </BentoCard>
              </StoreLink>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "article_index",
  category: "content",
  name: { en: "Guides list", ar: "قائمة الأدلة" },
  description: {
    en: "Lists the store's guides, newest first. Hidden until a guide is published.",
    ar: "يعرض أدلة المتجر من الأحدث. لا يظهر قبل نشر أول دليل.",
  },
  thumbnail: "/sections/article_index.svg",
  valid_on: ["home", "about", "faq"],
  schema,
  defaultProps,
  render: ArticleIndex,
};

registerSection(definition);
export default definition;
