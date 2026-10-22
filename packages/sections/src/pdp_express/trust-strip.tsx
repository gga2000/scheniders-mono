// Express trust strip: the merchant's trust chips as one compact, quiet
// list directly under the CTA (opt-in via `trust_chips_placement:
// "under_cta"`). Two per row at phone width, four in one row from `sm`.
// Arabic flips the visual order with classes only — the document stays LTR.

import { cn, resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import type { ExpressModel } from "./model";
import { readsRtl, xs } from "./text";

export function ExpressTrustStrip({
  chips,
  locale,
}: {
  chips: ExpressModel["trustChips"];
  locale: LocaleCode;
}) {
  const rtl = readsRtl(locale);
  return (
    <ul
      data-layer="trust"
      data-layer-label="Trust"
      aria-label={xs("trustListLabel", locale)}
      className={cn(
        "flex flex-wrap gap-y-bk-xs border-t border-bk-divider pt-bk-sm",
        rtl && "flex-row-reverse",
      )}
    >
      {chips.map((c, i) => (
        <li
          key={`${c.icon}-${i}`}
          className={cn(
            "flex min-w-0 basis-1/2 items-center gap-1.5 sm:basis-1/4",
            // Inline-end padding keeps two chips sharing a row apart. Not a
            // column gap: with basis-1/2 a gap would wrap the second chip.
            rtl ? "flex-row-reverse pl-bk-sm text-right" : "pr-bk-sm",
          )}
        >
          <MaterialIcon name={c.icon} className="shrink-0 text-lg text-bk-ink" />
          <span
            className="min-w-0 font-bk-body text-xs font-bold leading-tight text-bk-ink-soft"
            data-i18n-field="trust_chips.label_i18n"
          >
            {resolveI18n(c.label_i18n, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
