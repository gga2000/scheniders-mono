// =====================================================================
// Section — category_grid
// =====================================================================
// Grid of category cards (image + name). Reads ctx.categories. Supports
// "auto" mode (all visible categories, sorted by display_order) or
// "manual" (pinned category ids in display order).
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  Section,
  SectionHeader,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";
import type { Category } from "./types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  mode: z.enum(["auto", "manual"]),
  manual_category_ids: z.array(z.string()),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  limit: z.number().int().positive().max(24),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Shop by category", ar: "تسوّق حسب الفئة" },
  mode: "auto",
  manual_category_ids: [],
  columns: 3,
  limit: 12,
};

function selectCategories(
  props: Props,
  ctx: SectionRenderContext,
): Category[] {
  const all = ctx.categories ?? [];
  if (props.mode === "manual") {
    const byId = new Map(all.map((c) => [c.id, c]));
    return props.manual_category_ids
      .map((id) => byId.get(id))
      .filter((c): c is Category => !!c)
      .slice(0, props.limit);
  }
  const visible = all
    .filter((c) => c.is_visible !== false)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  return visible.slice(0, props.limit);
}

function pickName(c: Category, locale: "ar" | "en" | "ku"): string {
  if (locale === "ar" && c.name_ar) return c.name_ar;
  if (locale === "en" && c.name_en) return c.name_en;
  return c.name;
}

function CategoryGridRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const categories = ctx.categories;

  if (!categories) {
    if (process.env.NODE_ENV !== "production") {
      return (
        <div
          data-section-placeholder="category_grid"
          style={{
            padding: 12,
            border: "1px dashed #999",
            color: "#666",
            fontSize: 12,
          }}
        >
          category_grid — no categories in runtime context
        </div>
      );
    }
    return null;
  }

  const items = selectCategories(props, ctx);
  if (items.length === 0) return null;
  const heading = resolveI18n(props.heading_i18n, locale);

  const colsClass =
    props.columns === 2
      ? "grid-cols-2 lg:grid-cols-3"
      : props.columns === 4
        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  const tints = ["mint", "butter", "lilac", "sky", "cream"] as const;

  return (
    <Section>
      {heading && <SectionHeader title={heading} color="mint" />}
      <div className={`grid ${colsClass} gap-bk-sm sm:gap-bk-md`}>
        {items.map((c, i) => {
          const tint = tints[i % tints.length];
          const name = pickName(c, locale);
          return (
            <StoreLink
              key={c.id}
              href={`/categories/${c.slug}`}
              className="block group"
            >
              <BentoCard
                bg={tint}
                size="sm"
                rotate={i % 2 === 0 ? -0.5 : 0.5}
                className="p-0 overflow-hidden aspect-square relative"
                style={{ borderRadius: "var(--bk-radius-card, 1.25rem)" }}
              >
                {c.image_url ? (
                  <Image
                    src={c.image_url}
                    alt=""
                    fill
                    priority={i < props.columns}
                    sizes={
                      props.columns === 4
                        ? "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        : props.columns === 2
                          ? "(max-width: 1024px) 50vw, 33vw"
                          : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    }
                    className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-candy-ink/60 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="font-display font-black text-base sm:text-lg uppercase leading-tight text-white drop-shadow">
                    {name}
                  </p>
                </div>
              </BentoCard>
            </StoreLink>
          );
        })}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "category_grid",
  category: "content",
  name: { en: "Category grid", ar: "شبكة الفئات" },
  description: {
    en: "Grid of category cards with image and name, auto or manual.",
    ar: "شبكة بطاقات الفئات بالصور والأسماء، آلية أو يدوية.",
  },
  thumbnail: "/sections/category_grid.svg",
  valid_on: ["home", "category"],
  schema,
  defaultProps,
  render: CategoryGridRender,
};

registerSection(definition);
export default definition;
