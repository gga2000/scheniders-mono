// =====================================================================
// Section — free_gift_strip
// =====================================================================
// Progress strip used on the cart page: "Spend X more to unlock a free
// gift." Reads the live cart subtotal from the shared `useCart()` store
// (the same source every other cart section uses) so the bar updates as
// the customer adds items.
// =====================================================================
// Client half of `free_gift_strip` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./free_gift_strip.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { resolveI18n } from "@scheniders/shared";
import { BentoCard, Section } from "./helpers/primitives";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import type { Props } from "./free_gift_strip";

export function FreeGiftStrip({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const subtotal = useCart((s) => s.getTotal());
  const remaining = Math.max(0, props.threshold_iqd - subtotal);
  const unlocked = remaining === 0;
  const headingTemplate = resolveI18n(props.heading_i18n, locale);
  const unlockedLabel = resolveI18n(props.unlocked_label_i18n, locale);

  const headingResolved = headingTemplate.replace(
    /\{remaining\}/g,
    formatPrice(remaining, locale),
  );

  const pct = Math.min(
    100,
    Math.round((subtotal / props.threshold_iqd) * 100) || 0,
  );

  return (
    <Section density="dense">
      <BentoCard bg={unlocked ? "mint" : "butter"} size="sm" className="p-bk-sm sm:p-bk-md">
        <div className="flex items-center gap-bk-sm">
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-bk-input border-bk border-bk-ink shrink-0 bg-white overflow-hidden"
            aria-hidden="true"
          >
            {props.gift_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.gift_image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">
                🎁
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-black text-sm sm:text-base uppercase leading-tight">
              {unlocked ? unlockedLabel : headingResolved}
            </p>
            <div className="mt-bk-2xs h-2.5 rounded-full bg-white border-bk border-bk-ink overflow-hidden">
              <div
                className="h-full bg-bk-primary transition-[width] duration-bk-base motion-reduce:transition-none"
                style={{
                  width: `${pct}%`,
                  backgroundColor: "var(--bk-primary, #ff5a8a)",
                }}
              />
            </div>
          </div>
        </div>
      </BentoCard>
    </Section>
  );
}
