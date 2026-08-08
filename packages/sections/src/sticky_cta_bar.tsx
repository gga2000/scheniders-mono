// =====================================================================
// Section — sticky_cta_bar
// =====================================================================
// Sticky bottom CTA bar (mobile only). Renders a primary action button
// plus an optional secondary kind (WhatsApp, call, or none). When
// `show_total` is enabled and the bar is on the cart/checkout page,
// the live cart subtotal is read from `useCart()`.
// =====================================================================

"use client";

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  ChunkyButton,
  MaterialIcon,
  WhatsAppIcon,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import {
  resolveTenantWhatsapp,
  resolveTenantPhone,
  whatsappDigits,
} from "./helpers/whatsapp";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  primary_label_i18n: i18nStringSchema,
  primary_href: z.string(),
  secondary_label_i18n: i18nStringOptional,
  secondary_kind: z.enum(["whatsapp", "call", "none"]).optional(),
  show_total: z.boolean(),
  /** Point this bar's WhatsApp/call button at a different number than the
   *  store-wide one (store_config.contact.whatsapp_number). Empty = inherit. */
  whatsapp_override: z.string().optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  primary_label_i18n: { en: "Continue", ar: "متابعة" },
  primary_href: "/checkout",
  secondary_label_i18n: { en: "Chat", ar: "تواصل" },
  secondary_kind: "whatsapp",
  show_total: false,
};

function StickyCtaBarRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const primaryLabel = resolveI18n(props.primary_label_i18n, locale);
  const secondaryLabel = resolveI18n(props.secondary_label_i18n, locale);
  const subtotal = useCart((s) => s.getTotal());
  const itemCount = useCart((s) => s.getItemCount());

  // Resolve through the canonical store contact so this bar uses the same
  // store-wide WhatsApp number as every other section (with an optional
  // per-bar override).
  const waNumber = resolveTenantWhatsapp(ctx.tenant, props.whatsapp_override);
  const callNumber = resolveTenantPhone(ctx.tenant, props.whatsapp_override);

  const secondaryHref = (() => {
    if (props.secondary_kind === "whatsapp" && waNumber) {
      return `https://wa.me/${whatsappDigits(waNumber)}`;
    }
    if (props.secondary_kind === "call" && callNumber) {
      return `tel:${callNumber}`;
    }
    return null;
  })();

  if (!primaryLabel || !props.primary_href) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 sm:hidden bg-bk-surface-alt/95 backdrop-blur p-bk-xs flex items-center gap-bk-xs shadow-[0_-6px_0_0_rgba(26,26,26,0.06)]"
      style={{
        borderTop:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
      }}
      role="region"
      aria-label={locale !== "en" ? "إجراءات سريعة" : "Quick actions"}
    >
      {props.show_total && (
        <div className="flex flex-col leading-tight pl-1">
          <span className="font-label font-bold text-[10px] uppercase tracking-[0.2em] text-bk-ink-faint">
            {locale !== "en"
              ? `${itemCount} عنصر`
              : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </span>
          <span className="font-display font-black text-base">
            <bdi>{formatPrice(subtotal, locale)}</bdi>
          </span>
        </div>
      )}
      {secondaryHref && (
        <a
          href={secondaryHref}
          target={props.secondary_kind === "whatsapp" ? "_blank" : undefined}
          rel={
            props.secondary_kind === "whatsapp"
              ? "noopener noreferrer"
              : undefined
          }
          aria-label={secondaryLabel || props.secondary_kind || "secondary"}
        >
          <ChunkyButton type="button" bg="mint" size="md">
            {props.secondary_kind === "whatsapp" ? (
              <WhatsAppIcon className="w-5 h-5" />
            ) : (
              <MaterialIcon name="call" />
            )}
            {secondaryLabel}
          </ChunkyButton>
        </a>
      )}
      <StoreLink href={props.primary_href} className="flex-1">
        <ChunkyButton bg="pink" size="md" fullWidth>
          {primaryLabel}
        </ChunkyButton>
      </StoreLink>
    </div>
  );
}

const definition: SectionDefinition<Props> = {
  type: "sticky_cta_bar",
  category: "conversion",
  name: { en: "Sticky CTA bar", ar: "شريط زر سفلي" },
  description: {
    en: "Sticky bottom-of-screen mobile CTA with optional WhatsApp/call.",
    ar: "شريط زر سفلي ثابت للجوال مع واتساب أو اتصال اختياري.",
  },
  thumbnail: "/sections/sticky_cta_bar.svg",
  valid_on: ["product", "cart", "checkout"],
  schema,
  defaultProps,
  render: StickyCtaBarRender,
};

registerSection(definition);
export default definition;
