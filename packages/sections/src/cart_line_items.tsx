// =====================================================================
// Section — cart_line_items
// =====================================================================
// Cart line-item list. Reads cart items from `useCart()` and lets the
// shopper change quantities or remove items inline. Renders an empty
// state when the cart is empty.
// =====================================================================

"use client";

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  MaterialIcon,
} from "./helpers/primitives";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  show_thumbnails: z.boolean(),
  empty_state_message_i18n: i18nStringSchema,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  show_thumbnails: true,
  empty_state_message_i18n: {
    en: "Your cart is empty — keep shopping.",
    ar: "سلتك فارغة — تابع التسوّق.",
  },
};

function CartLineItemsRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const emptyMessage = resolveI18n(props.empty_state_message_i18n, locale);

  if (items.length === 0) {
    return (
      <section className="px-4 py-8">
        <BentoCard bg="cream" size="md" className="p-8 text-center">
          <MaterialIcon
            name="shopping_bag"
            className="text-5xl text-candy-ink/40"
          />
          <p className="mt-3 font-display font-black text-xl uppercase text-candy-ink">
            {emptyMessage}
          </p>
        </BentoCard>
      </section>
    );
  }

  return (
    <section className="px-4 py-6">
      <ul className="space-y-3">
        {items.map((item) => {
          const lineTotal = item.price * item.quantity;
          return (
            <li
              key={`${item.product_id}-${item.variant_id ?? "default"}`}
              className="rounded-2xl border-[3px] border-candy-ink bg-white shadow-bento-sm p-3 flex gap-3 items-center"
            >
              {props.show_thumbnails && (
                <div className="w-16 h-16 rounded-xl border-[3px] border-candy-ink bg-candy-cream overflow-hidden shrink-0">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MaterialIcon
                        name="image"
                        className="text-2xl text-candy-ink/40"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-display font-black text-sm uppercase leading-tight truncate">
                  {item.name}
                </p>
                {item.variant_name && (
                  <p className="font-label text-xs uppercase tracking-[0.15em] text-candy-ink/60 truncate">
                    {item.variant_name}
                  </p>
                )}
                <p className="mt-1 font-display font-black text-sm text-candy-pink">
                  {formatPrice(lineTotal)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center rounded-lg border-[3px] border-candy-ink bg-white">
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(
                        item.product_id,
                        item.variant_id,
                        item.quantity - 1,
                      )
                    }
                    aria-label="Decrease quantity"
                    className="w-7 h-7 flex items-center justify-center"
                  >
                    <MaterialIcon name="remove" className="text-base" />
                  </button>
                  <span className="w-7 text-center font-display font-black text-sm">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(
                        item.product_id,
                        item.variant_id,
                        item.quantity + 1,
                      )
                    }
                    aria-label="Increase quantity"
                    className="w-7 h-7 flex items-center justify-center"
                  >
                    <MaterialIcon name="add" className="text-base" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.product_id, item.variant_id)}
                  className="font-label font-bold text-[11px] uppercase tracking-[0.15em] text-candy-ink/60 hover:text-candy-pink"
                >
                  {locale === "ar" ? "إزالة" : "Remove"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "cart_line_items",
  category: "page",
  name: { en: "Cart line items", ar: "عناصر السلة" },
  description: {
    en: "Cart line item list with quantity steppers and remove buttons.",
    ar: "قائمة عناصر السلة مع زرّ كمية وإزالة.",
  },
  thumbnail: "/sections/cart_line_items.svg",
  valid_on: ["cart"],
  schema,
  defaultProps,
  render: CartLineItemsRender,
};

registerSection(definition);
export default definition;
