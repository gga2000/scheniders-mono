// =====================================================================
// order_confirmation — the thank-you call card (opt-in: show_call_card)
// =====================================================================
// A COD order is won or lost on one phone call. On the funnel this store
// replaces, 15–29% of orders ended `no_response`, and orders that had the
// instant WhatsApp or a second number ended there far less often. So when
// the merchant turns this on, the top of the thank-you page stops being a
// receipt and becomes the brief for that call:
//
//   - who will call: the store's call number (P4's commerce.contact
//     call_number, else resolveTrackerContact — the configured phone
//     number, else the WhatsApp number), with copy and a one-tap "save to
//     contacts" vCard, so the call is not a stranger's; and, when the
//     store set commerce.contact, P4's <ContactLine> saying when, computed
//     from the order moment;
//   - that a WhatsApp is waiting — ONLY once the platform logged the
//     confirmation as sent for this order, never promised in advance;
//   - the number the buyer typed, masked, with a WhatsApp link to fix it;
//   - "add a second number" when none was given, written to THIS order.
//
// Contact state is read from /api/checkout/orders/[id]/contact with the
// same `x-upsell-proof` the post-purchase offer and the referral code use:
// only the browser that placed the order holds it, the tenant comes from
// the proof, and the phone only ever comes back masked. Without the proof
// (a direct visit, an expired stash) the card still shows who will call.
// =====================================================================

"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import {
  formatIraqiPhoneDisplay,
  normalizeIraqiMobile,
  parseStoreContact,
  resolveI18n,
} from "@scheniders/shared";
import type { I18nString, LocaleCode, StoreContactConfig } from "@scheniders/shared";
import { ContactLine } from "./helpers/contact-line";
import { MaterialIcon } from "./helpers/primitives";
import { PRESSABLE } from "./helpers/utils";
import { buildVCard, vcardFileName, vcardHref } from "./helpers/vcard";
import { resolveTenantWhatsapp, resolveTrackerContact, whatsappDigits } from "./helpers/whatsapp";
import { CARD_STYLE, INK_BORDER, LABEL_CLS } from "./order_confirmation.styles";

/** Chrome strings (ar / en / ku — guarded by _kurdish-coverage). The three
 *  a merchant may reword are also schema props (call_card_*_i18n); these
 *  are their defaults. */
export const STRINGS = {
  heading: { en: "Done — your order is in", ar: "تم، طلبك ثابت", ku: "تەواو، داواکارییەکەت تۆمارکرا" },
  headingNamed: { en: "Done, {name} — your order is in", ar: "تم يا {name}، طلبك ثابت", ku: "تەواو {name}، داواکارییەکەت تۆمارکرا" },
  whatsappSent: { en: "We just sent you a WhatsApp — tap Confirm", ar: "رسالة واتساب وصلتك هسه — اضغط تأكيد", ku: "ئێستا نامەیەکی واتسئاپت بۆ هات — پشتڕاستکردنەوە دابگرە" },
  callFrom: { en: "We'll call you from this number", ar: "راح نتصل بيك من هذا الرقم", ku: "لەم ژمارەیەوە پەیوەندیت پێوە دەکەین" },
  saveContact: { en: "Save to contacts", ar: "احفظه بجهات الاتصال", ku: "لە پەیوەندییەکان پاشەکەوتی بکە" },
  contactName: { en: "{store} — order confirmation", ar: "{store} — تأكيد الطلبات", ku: "{store} — پشتڕاستکردنەوەی داواکاری" },
  yourNumber: { en: "Your number", ar: "رقمك", ku: "ژمارەکەت" },
  wrongNumber: { en: "Wrong number? Message us", ar: "الرقم غلط؟ راسلنا", ku: "ژمارەکە هەڵەیە؟ نامەمان بۆ بنێرە" },
  wrongNumberMessage: { en: "The number on my order {order} is wrong. The right one is: ", ar: "رقمي بالطلب {order} غلط، الرقم الصحيح: ", ku: "ژمارەکەم لە داواکاری {order} هەڵەیە، ژمارە دروستەکە: " },
  addBackup: { en: "Add a second number", ar: "أضف رقم ثاني", ku: "ژمارەیەکی دووەم زیاد بکە" },
  addBackupHint: { en: "If you miss our call, we'll try this one", ar: "إذا ما رديت على رقمك، نتصل على هذا", ku: "ئەگەر وەڵامی پەیوەندییەکەمانت نەدایەوە، پەیوەندی بەمەوە دەکەین" },
  backupLabel: { en: "Second number", ar: "الرقم الثاني", ku: "ژمارەی دووەم" },
  backupPlaceholder: { en: "0770 123 4567", ar: "0770 123 4567", ku: "0770 123 4567" },
  saveBackup: { en: "Save", ar: "احفظ", ku: "پاشەکەوتی بکە" },
  saving: { en: "Saving…", ar: "نحفظ…", ku: "پاشەکەوت دەکرێت…" },
  backupSaved: { en: "Saved — we'll try it if you miss our call", ar: "تم، نتصل عليه إذا ما رديت", ku: "پاشەکەوت کرا — ئەگەر وەڵامت نەدایەوە پەیوەندی پێوە دەکەین" },
  backupInvalid: { en: "Enter a valid Iraqi mobile, e.g. 0770 123 4567", ar: "اكتب رقم موبايل عراقي صحيح، مثل 0770 123 4567", ku: "ژمارەیەکی مۆبایلی عێراقی دروست بنووسە، نموونە: 0770 123 4567" },
  backupSame: { en: "That's the number you ordered with — enter a different one", ar: "هذا نفس رقمك الأول — اكتب رقم ثاني", ku: "ئەمە هەمان ژمارەی یەکەمتە — ژمارەیەکی تر بنووسە" },
  backupClosed: { en: "Your order is already with our team — send us the number on WhatsApp", ar: "طلبك صار عند فريقنا — دز لنا الرقم على واتساب", ku: "داواکارییەکەت گەیشتە تیمەکەمان — ژمارەکە لە واتسئاپ بۆمان بنێرە" },
  backupFailed: { en: "Couldn't save it — try again", ar: "ما انحفظ الرقم، جرّب مرة ثانية", ku: "پاشەکەوت نەکرا، دووبارە هەوڵ بدەرەوە" },
} satisfies Record<string, I18nString>;

/** The platform sends the WhatsApp confirmation through QStash a few
 *  seconds after the order lands (median 2.9 s on the funnel this store
 *  replaces), so the card asks again after these delays — and stops the
 *  moment the send is logged, or after the last one. */
const WA_RECHECK_DELAYS_MS: readonly number[] = [4_000, 10_000];

const PROOF_HEADER = "x-upsell-proof";

const contactUrl = (orderId: string) =>
  `/api/checkout/orders/${encodeURIComponent(orderId)}/contact`;

interface ContactStatus {
  phoneMasked: string | null;
  hasBackup: boolean;
  canAddBackup: boolean;
  whatsappSent: boolean;
}

/** The route's answer, parsed defensively — anything else is "no state". */
function parseStatus(v: unknown): ContactStatus | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.success !== true) return null;
  return {
    phoneMasked: typeof o.phone_masked === "string" ? o.phone_masked : null,
    hasBackup: o.has_backup === true,
    canAddBackup: o.can_add_backup === true,
    whatsappSent: o.whatsapp_sent === true,
  };
}

function useContactStatus(orderId?: string, proof?: string): ContactStatus | null {
  const [status, setStatus] = useState<ContactStatus | null>(null);
  useEffect(() => {
    if (!orderId || !proof) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (attempt: number) => {
      fetch(contactUrl(orderId), { headers: { [PROOF_HEADER]: proof } })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: unknown) => {
          if (!active) return;
          const next = parseStatus(body);
          if (!next) return;
          setStatus(next);
          if (!next.whatsappSent && attempt < WA_RECHECK_DELAYS_MS.length) {
            timer = setTimeout(() => check(attempt + 1), WA_RECHECK_DELAYS_MS[attempt]);
          }
        })
        .catch(() => {
          // Offline or the route is down: the card keeps showing the call
          // number and the order number. Nothing about the order is at
          // risk, and no state is invented in its place.
        });
    };
    check(0);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [orderId, proof]);
  return status;
}

type BackupError = "invalid" | "same" | "closed" | "failed";
type BackupState =
  | { kind: "idle" }
  | { kind: "open"; error: BackupError | null }
  | { kind: "saving" }
  | { kind: "saved" };

const BACKUP_ERROR_COPY: Record<BackupError, I18nString> = {
  invalid: STRINGS.backupInvalid,
  same: STRINGS.backupSame,
  closed: STRINGS.backupClosed,
  failed: STRINGS.backupFailed,
};

/** The route's refusal in the card's terms. `changed` = something else
 *  (P1's dispatch claim, the WhatsApp bot, staff) wrote the order between
 *  the route's read and its write; a retry re-reads the row, so it is
 *  "try again", not "closed". 404 = the proof expired: the order is past
 *  the point this page may change it, same as "closed". */
function backupError(status: number, body: unknown): BackupError {
  const code =
    body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (code === "invalid_phone") return "invalid";
  if (code === "same_as_primary") return "same";
  if (code === "changed") return "failed";
  if (status === 409 || status === 404) return "closed";
  return "failed";
}

const fill = (s: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((out, [k, v]) => out.split(`{${k}}`).join(v), s);

const PILL_CLS = `inline-flex min-h-11 items-center justify-center gap-1 px-4 font-label text-sm font-bold ${PRESSABLE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus`;

const PILL_STYLE = {
  border: INK_BORDER,
  borderRadius: "var(--bk-radius-pill, 9999px)",
  backgroundColor: "var(--bk-surface, #ffffff)",
  color: "var(--bk-ink, #1a1a1a)",
} as const;

const PRIMARY_PILL_STYLE = {
  ...PILL_STYLE,
  backgroundColor: "var(--bk-primary, #ff5a8a)",
  color: "var(--bk-on-primary, #ffffff)",
} as const;

export function CallCard({
  heading,
  whatsappSentCopy,
  tenant,
  contact,
  now,
  orderId,
  proof,
  orderNumber,
  locale,
  copyLabel,
  copiedLabel,
  children,
}: {
  /** Resolved by the section (merchant copy + first name). */
  heading: string;
  whatsappSentCopy: string;
  tenant: unknown;
  /** The store's `commerce.contact` (P4), as stored; validated here. */
  contact: StoreContactConfig | undefined;
  /** The request moment (`ctx.runtime.now`) — the order moment for the
   *  contact line's today / tomorrow variant. */
  now: Date;
  /** From the buyer's own stash, only when it belongs to this order. */
  orderId?: string;
  proof?: string;
  orderNumber: string;
  locale: LocaleCode;
  copyLabel: string;
  copiedLabel: string;
  /** The section's copyable order number. */
  children?: ReactNode;
}) {
  const t = (s: I18nString) => resolveI18n(s, locale);
  const status = useContactStatus(orderId, proof);

  // One number for the PDP line and this card: P4's structured call number
  // when the store set one, else the tracker's (phone_number, else WhatsApp).
  const callNumber = parseStoreContact(contact)?.call_number ?? resolveTrackerContact(tenant);
  // The card reports the WhatsApp from the send log (status.whatsappSent),
  // so the shared line is asked for its call-only lead here.
  const callOnlyContact = contact ? { ...contact, whatsapp_confirm: false } : undefined;
  const storeWhatsapp = resolveTenantWhatsapp(tenant);
  const storeName =
    (tenant as { business_name?: string | null } | null)?.business_name?.trim() ?? "";
  const callDisplay = callNumber ? formatIraqiPhoneDisplay(callNumber) : "";
  const callE164 = callNumber ? `+${whatsappDigits(callNumber)}` : "";
  const contactName = fill(t(STRINGS.contactName), { store: storeName }).trim();

  const wrongTemplate = t(STRINGS.wrongNumberMessage);
  const wrongMessage = orderNumber
    ? wrongTemplate.replace("{order}", orderNumber)
    : wrongTemplate.replace(/\s*\{order\}/g, "");
  const wrongHref = storeWhatsapp
    ? `https://wa.me/${whatsappDigits(storeWhatsapp)}?text=${encodeURIComponent(wrongMessage)}`
    : null;

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  const copyNumber = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(callDisplay).then(
      () => setCopied(true),
      // Clipboard denied: the number is a tel: link and readable text, so
      // the buyer can still call it or long-press it — nothing to surface.
      () => setCopied(false),
    );
  };

  const [backup, setBackup] = useState<BackupState>({ kind: "idle" });
  const [backupValue, setBackupValue] = useState("");
  const inputId = useId();
  const errorId = useId();
  const saving = backup.kind === "saving";
  const backupErr = backup.kind === "open" ? backup.error : null;
  const canAddBackup = Boolean(
    orderId && proof && status?.canAddBackup && !status.hasBackup,
  );

  const submitBackup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orderId || !proof || saving) return;
    const normalized = normalizeIraqiMobile(backupValue);
    if (!normalized) {
      setBackup({ kind: "open", error: "invalid" });
      return;
    }
    setBackup({ kind: "saving" });
    let res: Response;
    try {
      res = await fetch(contactUrl(orderId), {
        method: "POST",
        headers: { "content-type": "application/json", [PROOF_HEADER]: proof },
        body: JSON.stringify({ phone: normalized }),
      });
    } catch {
      // Network failure: whether it landed is unknown. The route answers a
      // retry of the same number as success, so offering a retry is safe.
      setBackup({ kind: "open", error: "failed" });
      return;
    }
    if (res.ok) {
      setBackup({ kind: "saved" });
      return;
    }
    const body: unknown = await res.json().catch(() => null);
    setBackup({ kind: "open", error: backupError(res.status, body) });
  };

  return (
    <div
      data-testid="call-card"
      className="p-bk-lg text-center sm:p-bk-xl"
      style={CARD_STYLE}
    >
      <h1
        data-i18n-field="call_card_heading_i18n"
        className="font-display text-bk-h1 font-black text-balance"
        style={{ fontFamily: "var(--bk-font-display, inherit)" }}
      >
        {heading}
      </h1>

      {children}

      {status?.whatsappSent && (
        <p
          data-testid="call-card-whatsapp"
          data-i18n-field="call_card_whatsapp_sent_i18n"
          role="status"
          className="mx-auto mt-bk-sm flex max-w-prose items-center justify-center gap-bk-2xs font-body text-base font-bold text-pretty"
        >
          <MaterialIcon name="mark_chat_unread" className="text-xl" />
          {whatsappSentCopy}
        </p>
      )}

      {callNumber && (
        <div className="mt-bk-md flex flex-col items-center gap-bk-2xs">
          <span className={LABEL_CLS}>{t(STRINGS.callFrom)}</span>
          <a
            data-testid="call-card-number"
            href={`tel:${callE164}`}
            dir="ltr"
            className="font-display text-bk-h2 font-black tabular-nums underline-offset-4 hover:underline"
            style={{ fontFamily: "var(--bk-font-display, inherit)" }}
          >
            {callDisplay}
          </a>
          <div className="mt-bk-2xs flex flex-wrap items-center justify-center gap-bk-xs">
            <button
              type="button"
              onClick={copyNumber}
              aria-live="polite"
              className={PILL_CLS}
              style={PILL_STYLE}
            >
              <MaterialIcon name={copied ? "check" : "content_copy"} className="text-base" />
              {copied ? copiedLabel : copyLabel}
            </button>
            <a
              data-testid="call-card-save"
              href={vcardHref(buildVCard({ name: contactName, phoneE164: callE164 }))}
              download={vcardFileName(contactName)}
              className={PILL_CLS}
              style={PILL_STYLE}
            >
              <MaterialIcon name="person_add" className="text-base" />
              {t(STRINGS.saveContact)}
            </a>
          </div>
          <ContactLine
            contact={callOnlyContact}
            locale={locale}
            initialNow={now}
            className="mx-auto mt-bk-xs flex max-w-prose items-start justify-center gap-bk-2xs font-body text-sm text-pretty text-bk-ink-soft"
            iconClassName="text-base"
          />
        </div>
      )}

      {status?.phoneMasked && (
        <div
          data-testid="call-card-your-number"
          className="mt-bk-md flex flex-col items-center gap-bk-2xs"
        >
          <span className={LABEL_CLS}>{t(STRINGS.yourNumber)}</span>
          <span dir="ltr" className="font-display text-lg font-black tabular-nums">
            {status.phoneMasked}
          </span>
          {wrongHref && (
            <a
              data-testid="call-card-wrong-number"
              href={wrongHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-label text-sm font-bold underline underline-offset-4 text-bk-ink-soft hover:text-bk-ink"
            >
              {t(STRINGS.wrongNumber)}
            </a>
          )}
        </div>
      )}

      {backup.kind === "saved" ? (
        <p
          data-testid="call-card-backup-saved"
          role="status"
          className="mt-bk-md font-body text-sm font-bold"
        >
          {t(STRINGS.backupSaved)}
        </p>
      ) : canAddBackup ? (
        backup.kind === "idle" ? (
          <button
            data-testid="call-card-add-backup"
            type="button"
            onClick={() => setBackup({ kind: "open", error: null })}
            className={`mt-bk-md ${PILL_CLS}`}
            style={PILL_STYLE}
          >
            <MaterialIcon name="add_call" className="text-base" />
            {t(STRINGS.addBackup)}
          </button>
        ) : (
          <form
            data-testid="call-card-backup-form"
            onSubmit={submitBackup}
            noValidate
            className="mx-auto mt-bk-md max-w-sm text-start"
          >
            <label htmlFor={inputId} className={LABEL_CLS}>
              {t(STRINGS.backupLabel)}
            </label>
            <p className="mt-0.5 font-body text-sm text-bk-ink-soft">
              {t(STRINGS.addBackupHint)}
            </p>
            <div className="mt-bk-2xs flex items-stretch gap-bk-xs">
              <input
                id={inputId}
                name="backup_phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                placeholder={t(STRINGS.backupPlaceholder)}
                value={backupValue}
                onChange={(e) => setBackupValue(e.target.value)}
                aria-invalid={backupErr ? true : undefined}
                aria-describedby={backupErr ? errorId : undefined}
                className="min-h-11 min-w-0 flex-1 px-3 font-body text-base tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
                style={{
                  border: INK_BORDER,
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  backgroundColor: "var(--bk-surface, #ffffff)",
                  color: "var(--bk-ink, #1a1a1a)",
                }}
              />
              <button
                type="submit"
                disabled={saving}
                aria-busy={saving}
                className={PILL_CLS}
                style={PRIMARY_PILL_STYLE}
              >
                {saving ? t(STRINGS.saving) : t(STRINGS.saveBackup)}
              </button>
            </div>
            {backupErr && (
              <p
                id={errorId}
                data-testid="call-card-backup-error"
                role="alert"
                className="mt-bk-2xs font-body text-sm font-bold"
                style={{ color: "var(--bk-danger, #e2574c)" }}
              >
                {t(BACKUP_ERROR_COPY[backupErr])}
              </p>
            )}
          </form>
        )
      ) : null}
    </div>
  );
}
