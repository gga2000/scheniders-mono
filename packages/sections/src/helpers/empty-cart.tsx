"use client";

import type { LocaleCode } from "@scheniders/shared";
import { cs } from "../cart_checkout.strings";
import { ChunkyLink, MaterialIcon } from "./primitives";
import { SOFT_CARD } from "./soft-commerce";
import { useStoreBase } from "./store-context";
import { cn } from "./utils";

/**
 * An empty cart (or a checkout reached with nothing in it): the message and
 * one way forward, to the catalogue. A dead end with only "the cart is
 * empty" leaves the shopper to find the menu themselves.
 */
export function EmptyCartState({
  message,
  locale,
  soft,
}: {
  message: string;
  locale: LocaleCode;
  /** The soft (rounded card) style; otherwise the inked classic card. */
  soft?: boolean;
}) {
  const base = useStoreBase();
  return (
    <section className="px-4 py-bk-section" data-cart-empty="" data-cart-style={soft ? "soft" : undefined}>
      <div
        className={cn(
          "flex flex-col items-center gap-bk-sm p-bk-xl text-center",
          soft && SOFT_CARD,
        )}
        style={
          soft
            ? undefined
            : {
                backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
                border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                borderRadius: "var(--bk-radius-card, 1rem)",
              }
        }
      >
        <MaterialIcon name="shopping_bag" className="text-5xl text-bk-ink-faint" />
        <h1
          // Joined, not cn(): tailwind-merge reads text-bk-ink and the
          // text-bk-* size token as one group and would drop the colour.
          className={`${soft ? "font-bk-display text-bk-chapter" : "font-display text-bk-h2"} font-black text-bk-ink text-balance`}
        >
          {message}
        </h1>
        {soft ? (
          <a
            href={`${base}/products`}
            className="inline-flex min-h-12 items-center justify-center rounded-bk-input border-bk border-bk-divider bg-bk-surface px-6 font-bk-body text-[15px] font-bold text-bk-ink transition-colors duration-bk-fast hover:bg-bk-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none"
          >
            {cs("browseProducts", locale)}
          </a>
        ) : (
          <ChunkyLink href={`${base}/products`} bg="cream" size="md">
            {cs("browseProducts", locale)}
          </ChunkyLink>
        )}
      </div>
    </section>
  );
}
