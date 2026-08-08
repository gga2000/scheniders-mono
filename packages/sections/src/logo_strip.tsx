// =====================================================================
// Section — logo_strip
// =====================================================================
// Logos of partners / press / payment methods, displayed as either a
// scrolling marquee or a static grid. Each logo can optionally link
// out (target="_blank").
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { Section, SectionHeader } from "./helpers/primitives";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  logos: z.array(
    z.object({
      name: z.string(),
      image_url: z.string().describe("image"),
      href: z.string().optional(),
    }),
  ),
  layout: z.enum(["scroll", "grid"]),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "As seen in", ar: "ظهرنا في" },
  layout: "scroll",
  logos: [
    { name: "Iraq Vogue", image_url: "", href: undefined },
    { name: "Niqash", image_url: "", href: undefined },
    { name: "Al-Mada", image_url: "", href: undefined },
    { name: "Karbala Daily", image_url: "", href: undefined },
    { name: "Rudaw", image_url: "", href: undefined },
  ],
};

function LogoCell({
  name,
  image_url,
  href,
}: {
  name: string;
  image_url: string;
  href?: string;
}) {
  const content = image_url ? (
    // Logos come from arbitrary partner/press hosts not in the storefront
    // image allowlist, so `unoptimized` bypasses the Next optimizer while
    // still using next/image for layout + lazy-loading semantics.
    <Image
      src={image_url}
      alt={name}
      width={160}
      height={48}
      unoptimized
      sizes="160px"
      className="max-h-12 w-auto opacity-80"
    />
  ) : (
    <span className="font-display font-black text-lg uppercase text-bk-ink-soft">
      {name}
    </span>
  );
  const wrapper = "inline-flex items-center justify-center min-w-[120px] h-16 shrink-0";
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={wrapper + " hover:opacity-100"}
      >
        {content}
      </a>
    );
  }
  return <div className={wrapper}>{content}</div>;
}

function LogoStripRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  if (props.logos.length === 0) return null;

  return (
    <Section density="dense">
      {heading && <SectionHeader title={heading} color="sky" />}
      {props.layout === "scroll" ? (
        <div className="overflow-hidden border-y-[3px] border-bk-ink bg-bk-surface py-3">
          <div className="flex gap-8 whitespace-nowrap animate-marquee">
            {[...props.logos, ...props.logos].map((logo, i) => (
              <LogoCell
                key={`${i}-${logo.name}`}
                name={logo.name}
                image_url={logo.image_url}
                href={logo.href}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-bk-md items-center">
          {props.logos.map((logo, i) => (
            <LogoCell
              key={`${i}-${logo.name}`}
              name={logo.name}
              image_url={logo.image_url}
              href={logo.href}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "logo_strip",
  category: "content",
  name: { en: "Logo strip", ar: "شريط شعارات" },
  description: {
    en: "Logos of partners, press, or payment methods — scroll or grid.",
    ar: "شعارات الشركاء أو الصحافة أو طرق الدفع — متحرّك أو شبكي.",
  },
  thumbnail: "/sections/logo_strip.svg",
  valid_on: ["home", "about", "cart", "checkout"],
  schema,
  defaultProps,
  render: LogoStripRender,
};

registerSection(definition);
export default definition;
