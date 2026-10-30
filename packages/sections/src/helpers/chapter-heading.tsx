// =====================================================================
// ChapterHeading — the one heading scale of the express product page
// =====================================================================
// The redesigned PDP has exactly four type steps (I18): chapter 22px/900,
// row 16px/700, body 14px/500, floor 12px/600. This is the chapter step:
// an optional eyebrow chip, the title at `text-bk-chapter` (the
// `--bk-text-chapter` token, 22px at 360–392px), and an optional one-line
// sub. It aligns to the reading edge of the locale with classes, never
// `dir`; the storefront's `unicode-bidi: plaintext` on h2/h3/p places the
// Arabic punctuation. Sections render it only when their `heading_style`
// is "chapter" (added per section in slices 1b–1e).
// =====================================================================

import type { ReactNode } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { EyebrowChip } from "./primitives";
import { readingAlignClass } from "./reading";
import { cn } from "./utils";

export function ChapterHeading({
  title,
  eyebrow,
  sub,
  locale,
  as: As = "h2",
  id,
  titleField,
  eyebrowField,
  subField,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  sub?: ReactNode;
  locale: LocaleCode;
  /** "h1" for a page whose chapter heading is its title (cart, checkout). */
  as?: "h1" | "h2" | "h3";
  /** Anchor id on the title, for in-page links. */
  id?: string;
  /** `data-i18n-field` hooks for the editor's inline text editing. */
  titleField?: string;
  eyebrowField?: string;
  subField?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-bk-md flex flex-col gap-bk-2xs", readingAlignClass(locale), className)}>
      {eyebrow ? <EyebrowChip data-i18n-field={eyebrowField}>{eyebrow}</EyebrowChip> : null}
      <As
        id={id}
        data-i18n-field={titleField}
        className="font-bk-display text-bk-chapter font-black text-bk-ink text-balance"
      >
        {title}
      </As>
      {sub ? (
        <p
          data-i18n-field={subField}
          className="max-w-prose font-bk-body text-sm text-bk-ink-soft text-pretty"
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
