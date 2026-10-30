// The dock's confirmation drawer (`cta_layout: "dock"` with add_to_cart):
// after an add, a cream tray slides out from under the espresso capsule —
// inset 16px from its ends and tucked beneath it — with ✓ «انضافت للسلة · {n}
// بالسلة» and an underlined «شوف السلة» link (or, when the cart already
// holds the most that can be ordered, that message).
//
// The tray is in the row from the first render, closed (zero height,
// transparent, not clickable), so its `role="status"` paragraph exists
// before the first add: a live region inserted together with its text is
// often not announced. The text is keyed by the tap count, so every tap is
// announced again. Opacity keeps it in the accessibility tree.

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import { StoreLink } from "../helpers/store-context";
import type { CartNote } from "./cart-action";
import { DockCheckIcon, DockChevronIcon } from "./dock-icons";
import { readsRtl, xs } from "./text";

export function DockDrawer({ note, locale }: { note: CartNote | null; locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  return (
    <div
      data-cart-drawer=""
      data-open={note ? "" : undefined}
      className={cn(
        "bk-xp-dock-drawer relative z-0 mx-4 -mt-8 rounded-b-[22px] bg-bk-surface-alt pt-8",
        rtl ? "pl-2.5 pr-1.5" : "pl-1.5 pr-2.5",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <p role="status" data-cart-status="" className="font-bk-body text-[13px] text-bk-ink">
          {note && (
            <span
              key={note.seq}
              className={cn("flex min-h-12 items-center justify-between gap-1.5", rtl && "flex-row-reverse")}
            >
              <span
                className={cn("flex min-w-0 items-center gap-[7px] font-bold", rtl && "flex-row-reverse text-right")}
              >
                {note.added ? (
                  <DockCheckIcon className="bk-xp-dock-ok block h-[18px] w-[18px] shrink-0" />
                ) : (
                  <MaterialIcon name="info" className="shrink-0 text-lg leading-none text-bk-ink-soft" />
                )}
                <span className="min-w-0">
                  {note.added ? xs("addedToCart", locale, { count: note.inCart }) : xs("cartAtMax", locale)}
                </span>
              </span>
              <StoreLink
                href="/cart"
                className={cn(
                  "bk-xp-dock-go inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-[22px] px-1.5 font-extrabold text-bk-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus",
                  rtl && "flex-row-reverse",
                )}
              >
                <span className="underline decoration-1 underline-offset-[5px]">{xs("viewCart", locale)}</span>
                <DockChevronIcon rtl={rtl} className="block h-[15px] w-[15px]" />
              </StoreLink>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
