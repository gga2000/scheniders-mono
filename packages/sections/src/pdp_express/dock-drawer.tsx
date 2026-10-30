// The dock's confirmation drawer (`cta_layout: "dock"` with add_to_cart):
// after an add, a cream tray slides out from under the espresso capsule —
// inset from its ends and tucked beneath it — with ✓ «انضافت للسلة · {n}
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
import { readsRtl } from "./text";

export function DockDrawer({ locale }: { locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  return (
    <div
      data-cart-drawer=""
      className={cn(
        "bk-xp-dock-drawer relative z-0 mx-5 -mt-8 rounded-b-[22px] bg-bk-surface-alt pt-8",
        rtl ? "pl-3.5 pr-1.5" : "pl-1.5 pr-3.5",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <p role="status" data-cart-status="" className="font-bk-body text-[13px] text-bk-ink">
        </p>
      </div>
    </div>
  );
}
