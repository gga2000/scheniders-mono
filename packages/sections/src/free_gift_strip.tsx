// =====================================================================
// Section — free_gift_strip
// =====================================================================
// Progress strip used on the cart page: "Spend X more to unlock a free
// gift." Reads the current cart subtotal off `window` so the strip
// updates as the customer adds items — but degrades to a static "spend
// X to unlock" message on SSR.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  Section,
} from "./helpers/primitives";
import { formatPrice } from "./helpers/format";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  threshold_iqd: z.number().int().positive(),
  gift_image_url: z.string().describe("image").optional(),
  unlocked_label_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: {
    en: "Spend {remaining} more to unlock a free gift",
    ar: "أضف بقيمة {remaining} لتفتح هدية مجانية",
  },
  threshold_iqd: 75_000,
  gift_image_url: undefined,
  unlocked_label_i18n: {
    en: "Free gift unlocked — added at checkout",
    ar: "تم فتح الهدية المجانية — ستُضاف عند الدفع",
  },
};

/**
 * Light-touch cart subtotal lookup. The storefront's cart state lives
 * in a context that varies by template — to keep this section portable
 * we sniff a documented global (`window.__schnCartSubtotal`) and fall
 * back to 0 if it isn't set yet.
 */
function useCartSubtotal(): number {
  const [subtotal, setSubtotal] = useState(0);
  useEffect(() => {
    function read() {
      const w = window as unknown as { __schnCartSubtotal?: number };
      setSubtotal(typeof w.__schnCartSubtotal === "number" ? w.__schnCartSubtotal : 0);
    }
    read();
    const id = window.setInterval(read, 750);
    return () => window.clearInterval(id);
  }, []);
  return subtotal;
}

function FreeGiftStrip({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const subtotal = useCartSubtotal();
  const remaining = Math.max(0, props.threshold_iqd - subtotal);
  const unlocked = remaining === 0;
  const headingTemplate = resolveI18n(props.heading_i18n, locale);
  const unlockedLabel = resolveI18n(props.unlocked_label_i18n, locale);

  const headingResolved = headingTemplate.replace(
    /\{remaining\}/g,
    formatPrice(remaining),
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
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-[3px] border-candy-ink shrink-0 bg-white overflow-hidden"
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
            <div className="mt-bk-2xs h-2.5 rounded-full bg-white border-[3px] border-candy-ink overflow-hidden">
              <div
                className="h-full bg-candy-pink transition-[width] duration-500"
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

const definition: SectionDefinition<Props> = {
  type: "free_gift_strip",
  category: "conversion",
  name: { en: "Free gift strip", ar: "شريط الهدية المجانية" },
  description: {
    en: "Cart progress bar toward a free-gift spending threshold.",
    ar: "شريط تقدّم في السلة نحو حدّ إنفاق يفتح هدية مجانية.",
  },
  thumbnail: "/sections/free_gift_strip.svg",
  valid_on: ["cart", "checkout"],
  schema,
  defaultProps,
  render: FreeGiftStrip,
};

registerSection(definition);
export default definition;
