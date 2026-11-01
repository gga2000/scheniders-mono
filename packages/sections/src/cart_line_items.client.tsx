// =====================================================================
// Section — cart_line_items
// =====================================================================
// Cart line-item list. Reads cart items from `useCart()` and lets the
// shopper change quantities or remove items inline. Renders an empty
// state when the cart is empty. Owns the cart page's h1.
// =====================================================================
// Client half of `cart_line_items` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./cart_line_items.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import Image from "next/image";
import { resolveI18n } from "@scheniders/shared";
import type { CartItem, LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, MaterialIcon } from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { formatCount, formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { readsRtl } from "./helpers/reading";
import { SOFT_RECEIPT } from "./helpers/soft-commerce";
import { cn } from "./helpers/utils";
import { EmptyCartState } from "./helpers/empty-cart";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./cart_line_items";

/** Chrome strings. Resolved through `resolveI18n` so Kurdish follows the
 *  storefront's ku → ar → en chain instead of an English-only `aria-label`. */
const STRINGS = {
  heading: { en: "Your cart", ar: "سلتك", ku: "سەبەتەکەت" },
  decrease: { en: "Decrease quantity", ar: "تقليل الكمية", ku: "کەمکردنەوەی بڕ" },
  increase: { en: "Increase quantity", ar: "زيادة الكمية", ku: "زیادکردنی بڕ" },
  remove: { en: "Remove", ar: "إزالة", ku: "لابردن" },
  quantity: { en: "Quantity", ar: "الكمية", ku: "بڕ" },
} as const;

function itemCountLine(count: number, locale: LocaleCode): string {
  return locale === "en"
    ? formatCount(count, locale, {
        one: "{count} item in your cart",
        other: "{count} items in your cart",
      })
    : formatCount(count, locale, {
        zero: "لا عناصر في سلتك",
        one: "عنصر واحد في سلتك",
        two: "عنصران في سلتك",
        few: "{count} عناصر في سلتك",
        many: "{count} عنصراً في سلتك",
        other: "{count} عنصر في سلتك",
      });
}

/** The line-item row is the raised surface on the cart page: the kit's card
 *  surface. Never literal white — its text is ink, which is light on a dark kit. */
const RAISED_CARD_BG = "var(--bk-surface-alt, #ffffff)";

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";

export function CartLineItemsRender({
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

  if (props.style === "soft") {
    return (
      <SoftCartLines
        items={items}
        locale={locale}
        emptyMessage={emptyMessage}
        showThumbnails={props.show_thumbnails}
        onQuantity={(item, qty) => updateQuantity(item.product_id, item.variant_id, qty)}
        onRemove={(item) => removeItem(item.product_id, item.variant_id)}
      />
    );
  }

  if (items.length === 0) {
    return <EmptyCartState message={emptyMessage} locale={locale} />;
  }

  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <section className="px-4 py-bk-section-dense">
      <CenteredSectionHeader
        as="h1"
        align="start"
        title={resolveI18n(STRINGS.heading, locale)}
        subtitle={itemCountLine(itemCount, locale)}
        className="mb-bk-md"
      />
      <ul className="space-y-bk-sm">
        {items.map((item) => {
          const lineTotal = item.price * item.quantity;
          return (
            <li
              key={`${item.product_id}-${item.variant_id ?? "default"}`}
              className="p-bk-sm flex gap-bk-sm items-center"
              style={{
                backgroundColor: RAISED_CARD_BG,
                border: INK_BORDER,
                borderRadius: "var(--bk-radius-card, 1rem)",
                boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
              }}
            >
              {props.show_thumbnails && (
                <div
                  className="relative w-16 h-16 overflow-hidden shrink-0"
                  style={{
                    backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
                    border: INK_BORDER,
                    borderRadius: "var(--bk-radius-input, 0.75rem)",
                  }}
                >
                  {item.image_url ? (
                    // Cart thumbnails are Supabase-hosted product images, so
                    // Next's optimizer can transcode them.
                    <Image
                      src={item.image_url}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MaterialIcon
                        name="image"
                        className="text-2xl text-bk-ink-faint"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-display font-black text-sm leading-tight truncate text-bk-ink">
                  {item.name}
                </p>
                {item.variant_name && (
                  <p className="font-label text-xs text-bk-ink-soft truncate">
                    {item.variant_name}
                  </p>
                )}
                <p className="mt-bk-2xs font-display font-black text-sm tabular-nums text-bk-primary">
                  <bdi>{formatPrice(lineTotal, locale)}</bdi>
                </p>
              </div>
              <div className="flex flex-col items-end gap-bk-xs">
                <div
                  role="group"
                  aria-label={resolveI18n(STRINGS.quantity, locale)}
                  className="flex items-center"
                  style={{
                    backgroundColor: "var(--bk-surface, #ffffff)",
                    border: INK_BORDER,
                    borderRadius: "var(--bk-radius-input, 0.5rem)",
                  }}
                >
                  {/* 44px targets: the stepper is the most-tapped control on
                      a phone cart and 28px buttons missed constantly. */}
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(
                        item.product_id,
                        item.variant_id,
                        item.quantity - 1,
                      )
                    }
                    aria-label={resolveI18n(STRINGS.decrease, locale)}
                    className="min-w-11 min-h-11 flex items-center justify-center"
                  >
                    <MaterialIcon name="remove" className="text-base" />
                  </button>
                  <span
                    aria-live="polite"
                    className="min-w-7 text-center font-display font-black text-sm tabular-nums"
                  >
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
                    aria-label={resolveI18n(STRINGS.increase, locale)}
                    className="min-w-11 min-h-11 flex items-center justify-center"
                  >
                    <MaterialIcon name="add" className="text-base" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.product_id, item.variant_id)}
                  className="min-h-11 font-label font-bold text-[11px] bk-caps tracking-[0.15em] text-bk-ink-soft hover:text-bk-primary"
                >
                  {resolveI18n(STRINGS.remove, locale)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** style "soft" (slice 1h): one hairline list in the express receipt's
 *  grammar. Each row reads from the right in Arabic (photo, name, then the
 *  stepper at the far end); the name wraps to two lines instead of an
 *  ellipsis; the line total is ink (D4: yellow is only the order action). */
function SoftCartLines({
  items,
  locale,
  emptyMessage,
  showThumbnails,
  onQuantity,
  onRemove,
}: {
  items: CartItem[];
  locale: LocaleCode;
  emptyMessage: string;
  showThumbnails: boolean;
  onQuantity: (item: CartItem, qty: number) => void;
  onRemove: (item: CartItem) => void;
}) {
  const rtl = readsRtl(locale);
  if (items.length === 0) {
    return <EmptyCartState message={emptyMessage} locale={locale} soft />;
  }
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  return (
    <section className="px-4 py-bk-section-dense" data-cart-style="soft">
      <ChapterHeading as="h1" locale={locale} title={resolveI18n(STRINGS.heading, locale)} sub={itemCountLine(itemCount, locale)} />
      <ul className={cn(SOFT_RECEIPT, "divide-y divide-bk-divider px-3")}>
        {items.map((item) => (
          <li key={`${item.product_id}-${item.variant_id ?? "default"}`}>
            <div className={cn("flex items-center gap-3 py-3", rtl && "flex-row-reverse")}>
              {showThumbnails && (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-bk-input bg-bk-surface-alt">
                  {item.image_url ? (
                    <Image src={item.image_url} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <MaterialIcon name="image" className="text-2xl text-bk-ink-faint" />
                    </div>
                  )}
                </div>
              )}
              <div className={cn("min-w-0 flex-1", rtl ? "text-right" : "text-left")}>
                <p className="line-clamp-2 font-bk-body text-[15px] font-bold leading-snug text-bk-ink" data-cart-line-name="">
                  {item.name}
                </p>
                {item.variant_name && (
                  <p className="font-bk-body text-xs text-bk-ink-soft">{item.variant_name}</p>
                )}
                <p className="mt-1 font-bk-display text-base font-black tabular-nums text-bk-ink">
                  <bdi>{formatPrice(item.price * item.quantity, locale)}</bdi>
                </p>
              </div>
              <div className={cn("flex shrink-0 flex-col gap-1", rtl ? "items-start" : "items-end")}>
                <div
                  role="group"
                  aria-label={resolveI18n(STRINGS.quantity, locale)}
                  className="flex items-center rounded-bk-input border-bk border-bk-divider bg-bk-surface"
                >
                  <button
                    type="button"
                    onClick={() => onQuantity(item, item.quantity - 1)}
                    aria-label={resolveI18n(STRINGS.decrease, locale)}
                    className="flex min-h-11 min-w-11 items-center justify-center text-bk-ink"
                  >
                    <MaterialIcon name="remove" className="text-base" />
                  </button>
                  <span aria-live="polite" className="min-w-7 text-center font-bk-display text-sm font-black tabular-nums text-bk-ink">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuantity(item, item.quantity + 1)}
                    aria-label={resolveI18n(STRINGS.increase, locale)}
                    className="flex min-h-11 min-w-11 items-center justify-center text-bk-ink"
                  >
                    <MaterialIcon name="add" className="text-base" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="min-h-11 px-1 font-bk-body text-xs font-semibold text-bk-ink-soft underline-offset-2 hover:text-bk-ink hover:underline"
                >
                  {resolveI18n(STRINGS.remove, locale)}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
