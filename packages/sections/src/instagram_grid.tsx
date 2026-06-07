// =====================================================================
// Section — instagram_grid
// =====================================================================
// Instagram-style tile grid. Each tile is an image that links out to
// Instagram (or any URL). Designed to bridge the storefront with the
// brand's social proof without needing a live Instagram API.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  MaterialIcon,
  ScribbleHeading,
  Section,
} from "./helpers/primitives";
import { i18nStringOptional, urlString } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  handle: z.string().optional(),
  columns: z.union([z.literal(3), z.literal(4), z.literal(6)]),
  items: z.array(
    z.object({
      image_url: urlString,
      link_url: urlString.optional(),
    }),
  ),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "From the gram", ar: "من إنستغرام" },
  handle: "@schneiders",
  columns: 6,
  items: [],
};

function InstagramGridRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  if (props.items.length === 0) return null;

  const heading = resolveI18n(props.heading_i18n, locale);
  const handle = props.handle?.trim();
  const handleHref = handle
    ? `https://instagram.com/${handle.replace(/^@/, "")}`
    : null;

  const colsClass =
    props.columns === 3
      ? "grid-cols-2 sm:grid-cols-3"
      : props.columns === 4
        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6";

  return (
    <Section>
      <div className="flex items-center justify-between mb-bk-lg gap-bk-sm">
        {heading && <ScribbleHeading color="lilac">{heading}</ScribbleHeading>}
        {handle && (
          <a
            href={handleHref ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink"
          >
            <MaterialIcon name="photo_camera" className="text-base" />
            {handle}
          </a>
        )}
      </div>
      <div className={`grid ${colsClass} gap-bk-xs sm:gap-bk-sm`}>
        {props.items.slice(0, 12).map((item, i) => {
          const href = item.link_url || handleHref || "#";
          return (
            <a
              key={`${i}-${item.image_url}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <BentoCard
                bg="white"
                size="sm"
                className="p-0 overflow-hidden aspect-square"
                style={{ borderRadius: "var(--bk-radius-card, 1rem)" }}
              >
                {/* Instagram media is served from arbitrary CDN hosts not in
                    the storefront image allowlist, so `unoptimized` bypasses
                    the Next optimizer while keeping next/image layout. */}
                <Image
                  src={item.image_url}
                  alt=""
                  fill
                  unoptimized
                  sizes={
                    props.columns === 6
                      ? "(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 17vw"
                      : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  }
                  className="object-cover group-hover:scale-105 transition-transform"
                />
              </BentoCard>
            </a>
          );
        })}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "instagram_grid",
  category: "content",
  name: { en: "Instagram grid", ar: "شبكة إنستغرام" },
  description: {
    en: "6-12 Instagram-style image tiles linking out.",
    ar: "شبكة صور بأسلوب إنستغرام تربط بحساب البراند.",
  },
  thumbnail: "/sections/instagram_grid.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: InstagramGridRender,
};

registerSection(definition);
export default definition;
