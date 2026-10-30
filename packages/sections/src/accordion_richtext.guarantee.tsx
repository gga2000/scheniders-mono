// =====================================================================
// accordion_richtext — `layout: "guarantee_card"` («كرت الضمان», spec §1.5)
// =====================================================================
// The four policy rows become one espresso ticket that states each term
// once, with nothing to open: an eyebrow, the title at the chapter scale,
// a sub line, then numbered terms (title + body, split on blank lines as
// every accordion body is). A stub row under a dashed tear line carries
// one link to the full policy page, with a surface-coloured notch on each
// long edge. A faint security-paper rosette sits behind the header. The
// card carries `id={anchor_id}`, the target of the promise band's
// «الشروط» link. Server-rendered, no client JS. Yellow only tints the
// numerals, the eyebrow and the stub arrow (D4); it never fills a shape.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, Section } from "./helpers/primitives";
import { readsRtl } from "./helpers/reading";
import { StoreLink } from "./helpers/store-context";
import { cn } from "./helpers/utils";

export interface GuaranteeCardData {
  anchorId: string | undefined;
  eyebrow: string;
  title: string;
  sub: string;
  terms: { title: string; body: string }[];
  policy: { href: string; label: string } | null;
}

/** Twelve ellipses round a circle: a certificate cue, not a stamp or logo. */
function Rosette() {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.35"
      aria-hidden="true"
      className="pointer-events-none absolute -left-10 -top-10 -z-10 size-44 text-bk-on-secondary/[0.08]"
    >
      <g transform="translate(50 50)">
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse key={i} rx="46" ry="16" transform={`rotate(${i * 15})`} />
        ))}
        <circle r="48" />
        <circle r="12" />
      </g>
    </svg>
  );
}

export function GuaranteeCard({ data, locale }: { data: GuaranteeCardData; locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  const side = rtl ? "text-right" : "text-left";
  return (
    <Section>
      <article
        id={data.anchorId}
        data-guarantee-card="true"
        className="relative isolate scroll-mt-24 overflow-hidden rounded-bk-card bg-bk-secondary text-bk-on-secondary"
      >
        <Rosette />
        <div className="px-5 pb-bk-sm pt-6">
          <div className={cn("flex flex-col gap-bk-xs", rtl ? "items-end text-right" : "items-start text-left")}>
            {data.eyebrow && (
              <span
                data-i18n-field="eyebrow_i18n"
                className="inline-flex rounded-bk-pill bg-bk-on-secondary/10 px-2.5 py-0.5 font-bk-body text-xs font-bold text-bk-primary"
              >
                {data.eyebrow}
              </span>
            )}
            {data.title && (
              <h2
                data-i18n-field="heading_i18n"
                className="font-bk-display text-bk-chapter font-black text-bk-on-secondary text-balance"
              >
                {data.title}
              </h2>
            )}
            {data.sub && (
              <p data-i18n-field="sub_i18n" className="font-bk-body text-sm font-semibold text-bk-on-secondary/75">
                {data.sub}
              </p>
            )}
          </div>
          <ol className="mt-bk-md divide-y divide-bk-on-secondary/15">
            {data.terms.map((term, i) => (
              <li key={`${i}-${term.title}`} data-guarantee-term={i} className="py-3.5 first:pt-1">
                <h3
                  className={cn(
                    "flex items-center gap-2.5 font-bk-display text-base font-extrabold leading-snug text-bk-on-secondary",
                    rtl ? "flex-row-reverse text-right" : "text-left",
                  )}
                >
                  <span
                    data-guarantee-num="true"
                    aria-hidden="true"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-bk-pill border-[1.5px] border-current text-xs font-black tabular-nums text-bk-primary"
                  >
                    {i + 1}
                  </span>
                  <span data-i18n-field={`items[${i}].title_i18n`}>{term.title}</span>
                </h3>
                <div data-i18n-field={`items[${i}].body_i18n`} className="mt-1 space-y-2">
                  {term.body.split(/\n{2,}/).map((p, j) => (
                    <p
                      key={j}
                      className={cn(
                        "whitespace-pre-line font-bk-body text-sm leading-relaxed text-bk-on-secondary/90 text-pretty",
                        side,
                      )}
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
        {data.policy && (
          <div className="relative border-t-[1.5px] border-dashed border-bk-on-secondary/30">
            <span aria-hidden="true" className="absolute -left-3 -top-3 size-6 rounded-bk-pill bg-bk-surface" />
            <span aria-hidden="true" className="absolute -right-3 -top-3 size-6 rounded-bk-pill bg-bk-surface" />
            <StoreLink
              href={data.policy.href}
              data-i18n-field="policy_link.label_i18n"
              className={cn(
                "flex min-h-12 items-center justify-between gap-2.5 px-6 py-2 font-bk-body text-sm font-bold text-bk-on-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus",
                rtl && "flex-row-reverse",
              )}
            >
              <span className="underline decoration-bk-primary/60 decoration-[1.5px] underline-offset-4">
                {data.policy.label}
              </span>
              <MaterialIcon name={rtl ? "arrow_back" : "arrow_forward"} className="text-lg text-bk-primary" />
            </StoreLink>
          </div>
        )}
      </article>
    </Section>
  );
}
