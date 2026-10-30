// The dock's «أضف للسلة» segment (`cta_layout: "dock"` with add_to_cart):
// a cream bag-with-plus over its label on the espresso capsule. The tap is
// the 1g tile's own (`useExpressCartAdd`): a `type="button"` that never
// submits the order or runs its validation, adds the chosen variant and
// quantity capped at what can be ordered, and asks for the variant while
// one is owed. After a tap the bag carries the line's count in the cart —
// the number the drawer says — as a small cream badge ringed in espresso.
// The badge never renders on the server (no hydration mismatch) and is
// hidden from assistive tech: the drawer's live region speaks.

import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { useExpressCartAdd, type CartAddOutcome } from "./cart-action";
import { DockBagIcon } from "./dock-icons";
import { DOCK_LABEL, DOCK_SEGMENT } from "./dock-style";
import type { ExpressModel } from "./model";
import { xs } from "./text";

export function DockCartSegment({
  m,
  locale,
  onAdded,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  onAdded: (outcome: CartAddOutcome) => void;
}) {
  const add = useExpressCartAdd(m, onAdded);

  return (
    <button
      type="button"
      onClick={add}
      disabled={m.submitting}
      data-cart-add=""
      className={cn(DOCK_SEGMENT, "w-[72px] disabled:cursor-not-allowed disabled:opacity-50")}
    >
      <span aria-hidden="true" className="relative">
        <DockBagIcon className="block h-[22px] w-[22px]" />
      </span>
      <span className={DOCK_LABEL}>{xs("addToCart", locale)}</span>
    </button>
  );
}
