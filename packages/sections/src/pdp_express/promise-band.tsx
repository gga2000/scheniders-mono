"use client";

// =====================================================================
// Express promise band (F01, spec §1.3) — `promise_layout: "band"`
// =====================================================================
// One espresso card under the order status messages, so a failed submit's
// message is never pushed below it. Three rows, each only with its data:
//   1. try before you pay (`reassurance_i18n`), the return line
//      (`return_promise_i18n`) and a «الشروط» link to the guarantee terms;
//   2. «التوصيل مجاني.» when every governorate is free (else «التوصيل»),
//      with the merchant's delivery SLA;
//   3. who calls, from the one shared contact resolver (the same sentence
//      as the contact line and the thank-you card), and «احفظ رقمنا».
// No row → no card. The number stays text, never a tel: link (D12): a
// call link above the proof pulls buyers away from the form. Yellow only
// tints the icons (D4); the save pill is an outline, never a fill.
// =====================================================================

import { useState } from "react";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { ContactLineText, useContactLine } from "../helpers/contact-line";
import { MaterialIcon } from "../helpers/primitives";
import { buildVCard, vcardContactName, vcardFileName, vcardHref } from "../helpers/vcard";
import { whatsappDigits } from "../helpers/whatsapp";
import type { ExpressModel } from "./model";
import { pickSaveRoute, shareOrCopy, type SaveOutcome } from "./save-number";
import type { ExpressStringKey } from "./strings";
import { readsRtl, xs } from "./text";

export interface PromiseRows {
  trust: { title: string; fact: string; anchorId: string | undefined } | null;
  delivery: { title: string; fact: string } | null;
}

/** Rows 1 and 2 from the model; row 3 comes from the ticking contact line. */
export function promiseRows(input: {
  reassurance: string;
  returnPromise: string;
  guaranteeAnchorId: string | undefined;
  freeEverywhere: boolean;
  deliverySla: string;
  locale: LocaleCode;
}): PromiseRows {
  const trust = input.reassurance.trim()
    ? {
        title: input.reassurance,
        fact: input.returnPromise.trim(),
        anchorId: input.guaranteeAnchorId,
      }
    : null;
  const sla = input.deliverySla.trim();
  const delivery =
    input.freeEverywhere || sla
      ? {
          title: xs(input.freeEverywhere ? "freeDeliveryTitle" : "delivery", input.locale),
          fact: sla,
        }
      : null;
  return { trust, delivery };
}

const HINT_KEY: Record<Exclude<SaveOutcome, null>, ExpressStringKey> = {
  opened: "numberSaveHint",
  copied: "numberCopiedHint",
  manual: "numberManualHint",
};

const FACT_CLS = "font-bk-body text-[13px] leading-snug text-bk-on-secondary/80";

function BandRow({
  row,
  icon,
  rtl,
  title,
  titleField,
  children,
}: {
  row: "trust" | "delivery" | "call";
  icon: string;
  rtl: boolean;
  title: React.ReactNode;
  titleField?: string;
  children?: React.ReactNode;
}) {
  return (
    <li
      data-promise-row={row}
      className={cn("flex min-h-11 items-start gap-3 py-2.5", rtl && "flex-row-reverse")}
    >
      <MaterialIcon name={icon} className="mt-0.5 shrink-0 text-xl text-bk-primary" />
      <div className={cn("min-w-0 flex-1 space-y-1", rtl ? "text-right" : "text-left")}>
        <p className="font-bk-body text-[15px] font-bold leading-snug" data-i18n-field={titleField}>
          {title}
        </p>
        {children}
      </div>
    </li>
  );
}

export function PromiseBand({
  m,
  locale,
  freeEverywhere,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  /** Every governorate's fee is 0 for this basket (computed by the receipt). */
  freeEverywhere: boolean;
}) {
  const rtl = readsRtl(locale);
  const line = useContactLine(m.contactConfig, locale, m.ctx.runtime.now);
  const [outcome, setOutcome] = useState<SaveOutcome>(null);
  const { trust, delivery } = promiseRows({
    reassurance: m.reassurance,
    returnPromise: m.returnPromise,
    guaranteeAnchorId: m.guaranteeAnchorId,
    freeEverywhere,
    deliverySla: m.deliverySla,
    locale,
  });
  if (!trust && !delivery && !line) return null;

  // One name for this pill and the thank-you call card (D15).
  const name = vcardContactName(m.ctx.tenant, locale);
  const vcard = line ? buildVCard({ name, phoneE164: `+${whatsappDigits(line.dial)}` }) : "";
  const fileName = vcardFileName(name);
  const hint = outcome ? xs(HINT_KEY[outcome], locale, { name }) : "";

  const onSave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!line) return;
    const nav = window.navigator;
    const file = new File([vcard], fileName, { type: "text/vcard" });
    const hasClipboard = "clipboard" in nav && typeof nav.clipboard.writeText === "function";
    const route = pickSaveRoute({
      userAgent: nav.userAgent,
      maxTouchPoints: nav.maxTouchPoints,
      canShareFile: typeof nav.canShare === "function" && nav.canShare({ files: [file] }),
      hasClipboard,
    });
    // The link's own navigation opens the vCard; say what to expect.
    if (route === "vcard") {
      setOutcome("opened");
      return;
    }
    e.preventDefault();
    void shareOrCopy(
      route,
      {
        share: typeof nav.share === "function" ? (f) => nav.share({ files: [f], title: name }) : undefined,
        writeText: hasClipboard ? (text) => nav.clipboard.writeText(text) : undefined,
      },
      file,
      line.number,
    ).then(setOutcome);
  };

  return (
    <div data-promise-band="true">
      <ul
        aria-label={xs("promiseListLabel", locale)}
        className="divide-y divide-bk-on-secondary/15 rounded-bk-card bg-bk-secondary px-4 py-1 text-bk-on-secondary"
      >
        {trust && (
          <BandRow row="trust" icon="verified_user" rtl={rtl} title={trust.title} titleField="reassurance_i18n">
            {(trust.fact || trust.anchorId) && (
              <p className={FACT_CLS}>
                {trust.fact && <span data-i18n-field="return_promise_i18n">{trust.fact}</span>}
                {trust.fact && trust.anchorId && " "}
                {trust.anchorId && (
                  <a
                    href={`#${trust.anchorId}`}
                    className="relative inline-block font-bold text-bk-on-secondary underline underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-[13px] before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
                  >
                    {xs("termsLink", locale)}
                  </a>
                )}
              </p>
            )}
          </BandRow>
        )}
        {delivery && (
          <BandRow row="delivery" icon="local_shipping" rtl={rtl} title={delivery.title}>
            {delivery.fact && (
              <p className={FACT_CLS} data-i18n-field="delivery_sla_i18n">
                {delivery.fact}
              </p>
            )}
          </BandRow>
        )}
        {line && (
          <BandRow row="call" icon="call" rtl={rtl} title={<ContactLineText line={line} />}>
            <a
              href={vcardHref(vcard)}
              download={fileName}
              onClick={onSave}
              data-save-number="true"
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-bk-pill border-bk border-bk-on-secondary/40 px-3 font-bk-body text-[13px] font-bold text-bk-on-secondary transition-colors duration-bk-fast hover:bg-bk-on-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none",
                rtl && "flex-row-reverse",
              )}
            >
              <MaterialIcon name="person_add" className="text-base" />
              {xs("saveNumber", locale)}
            </a>
          </BandRow>
        )}
      </ul>
      <p
        aria-live="polite"
        data-save-hint="true"
        className={cn(
          "mt-bk-xs text-center font-bk-body text-[13px] font-bold text-bk-ink-soft",
          !hint && "sr-only",
        )}
      >
        {hint}
      </p>
    </div>
  );
}
