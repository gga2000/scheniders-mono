// =====================================================================
// "Who contacts you" — the line under the order button
// =====================================================================
// Most COD losses happen after the order is placed: the buyer does not
// answer the confirmation call from a number they do not know. This line
// tells them, before they tap, which number will call and — when the store
// has set call hours — when. One resolver for every surface (PDP classic,
// PDP express, the thank-you card), so they can never disagree.
//
// Honesty rules:
//   • No config, or a call number that is not an Iraqi mobile → no line.
//   • No (valid) call hours → the channel and the number only, no time.
//   • With hours → today / tomorrow / a named weekday, built only from the
//     configured window. It never promises minutes ("within 30 min").
//   • WhatsApp is announced only when the store has said it sends one.
// =====================================================================

import { z } from "zod";
import { formatIraqiPhoneDisplay, normalizeIraqiMobile } from "./phone";
import { utcISOToZonedWallTime } from "./schedule-time";
import { resolveI18n } from "./types/store-config-v2";
import type {
  ContactWeekday,
  I18nString,
  LocaleCode,
  StoreCallHours,
  StoreContactConfig,
} from "./types/store-config-v2";

/** Sunday first, so an index is `Date#getUTCDay()`. */
export const CONTACT_WEEKDAYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const satisfies readonly ContactWeekday[];

/** The Iraq market's zone; call hours without `tz` are read in it. */
export const DEFAULT_CONTACT_TIMEZONE = "Asia/Baghdad";

const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function clockMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** True when this runtime's Intl knows `tz`. An unknown zone makes Intl
 *  throw a RangeError at format time; the catch IS the answer here (the
 *  zone is rejected and the hours fall back to channel-only), not a
 *  swallowed failure. */
function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const clockSchema = z.string().regex(CLOCK_RE);

export const callHoursSchema = z
  .object({
    days: z.array(z.enum(CONTACT_WEEKDAYS)).min(1),
    from: clockSchema,
    to: clockSchema,
    tz: z.string().refine(isTimeZone).default(DEFAULT_CONTACT_TIMEZONE),
  })
  .refine((h) => clockMinutes(h.from) < clockMinutes(h.to));

/** `commerce.contact.name_i18n`: the store name the confirmation chrome
 *  uses («رد {store}», the saved vCard contact). Written inline because
 *  this package cannot import the sections' `i18nStringSchema`; the
 *  sections' `storeDisplayName` parses the raw field with this same
 *  object, so the two can never disagree. */
export const storeContactNameSchema = z.object({
  ar: z.string().optional(),
  en: z.string().optional(),
  ku: z.string().optional(),
});

/** Parses the stored `commerce.contact` jsonb. `call_number` comes out
 *  normalized to `07XXXXXXXXX`; a malformed `call_hours`,
 *  `whatsapp_confirm` or `name_i18n` degrades to absent instead of failing
 *  the parse. */
export const storeContactConfigSchema = z.object({
  call_number: z
    .string()
    .transform((v) => normalizeIraqiMobile(v))
    .pipe(z.string()),
  call_hours: callHoursSchema.optional().catch(undefined),
  whatsapp_confirm: z.boolean().optional().catch(undefined),
  name_i18n: storeContactNameSchema.optional().catch(undefined),
});

type ParsedCallHours = Required<StoreCallHours>;
type ParsedStoreContact = Required<Pick<StoreContactConfig, "call_number">> & {
  call_hours?: ParsedCallHours;
  whatsapp_confirm?: boolean;
  name_i18n?: I18nString;
};

/** The stored contact block, validated — or null when there is no usable
 *  call number. The return type is the stored type, so the schema and
 *  `StoreContactConfig` cannot drift apart without a type error. */
export function parseStoreContact(raw: unknown): ParsedStoreContact | null {
  const parsed = storeContactConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Chrome strings. Every entry carries ar, en and ku. */
export const CONTACT_LINE_STRINGS = {
  leadWhatsapp: {
    ar: "راح توصلك رسالة واتساب لتأكيد طلبك، وبعدها اتصال من {number}{when} — رد علينا ويطلع طلبك",
    en: "You'll get a WhatsApp message to confirm your order, then a call from {number}{when}. Answer it and your order ships.",
    ku: "نامەیەکی واتسئاپت بۆ دێت بۆ دڵنیاکردنەوەی داواکارییەکەت، پاشان پەیوەندییەک لە {number}{when} — وەڵام بدەرەوە و داواکارییەکەت دەنێردرێت",
  },
  leadCall: {
    ar: "راح يوصلك اتصال من {number}{when} لتأكيد طلبك — رد علينا ويطلع طلبك",
    en: "You'll get a call from {number}{when} to confirm your order. Answer it and your order ships.",
    ku: "پەیوەندییەکت لە {number}{when} بۆ دێت بۆ دڵنیاکردنەوەی داواکارییەکەت — وەڵام بدەرەوە و داواکارییەکەت دەنێردرێت",
  },
  openNow: {
    ar: "اليوم قبل الساعة {to}",
    en: "today before {to}",
    ku: "ئەمڕۆ پێش کاتژمێر {to}",
  },
  laterToday: {
    ar: "اليوم من الساعة {from}",
    en: "today from {from}",
    ku: "ئەمڕۆ لە کاتژمێر {from} بەدواوە",
  },
  tomorrow: {
    ar: "باچر من الساعة {from}",
    en: "tomorrow from {from}",
    ku: "سبەینێ لە کاتژمێر {from} بەدواوە",
  },
  nextDay: {
    ar: "يوم {day} من الساعة {from}",
    en: "on {day} from {from}",
    ku: "ڕۆژی {day} لە کاتژمێر {from} بەدواوە",
  },
  am: { ar: "ص", en: "am", ku: "پ.ن" },
  pm: { ar: "م", en: "pm", ku: "د.ن" },
} satisfies Record<string, Required<I18nString>>;

export const CONTACT_WEEKDAY_NAMES = {
  sun: { ar: "الأحد", en: "Sunday", ku: "یەکشەممە" },
  mon: { ar: "الاثنين", en: "Monday", ku: "دووشەممە" },
  tue: { ar: "الثلاثاء", en: "Tuesday", ku: "سێشەممە" },
  wed: { ar: "الأربعاء", en: "Wednesday", ku: "چوارشەممە" },
  thu: { ar: "الخميس", en: "Thursday", ku: "پێنجشەممە" },
  fri: { ar: "الجمعة", en: "Friday", ku: "هەینی" },
  sat: { ar: "السبت", en: "Saturday", ku: "شەممە" },
} satisfies Record<ContactWeekday, Required<I18nString>>;

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}

/** "21:00" → "9 م" / "9 pm" / "9 د.ن"; "10:30" → "10:30 ص". Minutes only
 *  when the configured time has them. */
export function formatClock(hhmm: string, locale: LocaleCode): string {
  const total = clockMinutes(hhmm);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
  const suffix = resolveI18n(h < 12 ? CONTACT_LINE_STRINGS.am : CONTACT_LINE_STRINGS.pm, locale);
  return `${h12}${mm} ${suffix}`;
}

export type ContactLineVariant =
  | "channel"
  | "open_now"
  | "later_today"
  | "tomorrow"
  | "next_day";

/** Named `Resolved…` so it never collides with the `<ContactLine>`
 *  component in `@scheniders/sections` when a file imports both. */
export interface ResolvedContactLine {
  variant: ContactLineVariant;
  /** The full sentence, number included. */
  text: string;
  /** The number as printed in `text` (`0777 970 3832`). */
  number: string;
  /** The same number in dialable local form (`07779703832`), for tel: and vCard. */
  dial: string;
}

type TimedVariant = Exclude<ContactLineVariant, "channel">;

/** Where `now` falls against the call window, read in the window's zone.
 *  Null only if no configured day exists, which the schema rules out. */
function callWindow(
  hours: ParsedCallHours,
  now: Date,
): { variant: TimedVariant; day: ContactWeekday } | null {
  const wall = utcISOToZonedWallTime(now.toISOString(), hours.tz);
  const [date, time] = wall.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const nowMin = clockMinutes(time);
  const open = new Set<ContactWeekday>(hours.days);
  const today = CONTACT_WEEKDAYS[dow];
  if (open.has(today)) {
    if (nowMin < clockMinutes(hours.from)) return { variant: "later_today", day: today };
    if (nowMin < clockMinutes(hours.to)) return { variant: "open_now", day: today };
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = CONTACT_WEEKDAYS[(dow + ahead) % 7];
    if (open.has(day)) return { variant: ahead === 1 ? "tomorrow" : "next_day", day };
  }
  return null;
}

const WHEN_KEY: Record<TimedVariant, keyof typeof CONTACT_LINE_STRINGS> = {
  open_now: "openNow",
  later_today: "laterToday",
  tomorrow: "tomorrow",
  next_day: "nextDay",
};

/**
 * The "who contacts you" sentence for `raw` (the stored
 * `commerce.contact`) at the moment `now` — the render moment on the PDP,
 * the order moment on the thank-you card. Null = render nothing.
 */
export function resolveContactLine(
  raw: unknown,
  locale: LocaleCode,
  now: Date,
): ResolvedContactLine | null {
  const contact = parseStoreContact(raw);
  if (!contact) return null;
  const dial = contact.call_number;
  const number = formatIraqiPhoneDisplay(dial);
  const lead = resolveI18n(
    contact.whatsapp_confirm ? CONTACT_LINE_STRINGS.leadWhatsapp : CONTACT_LINE_STRINGS.leadCall,
    locale,
  );
  const slot =
    contact.call_hours && !Number.isNaN(now.getTime())
      ? callWindow(contact.call_hours, now)
      : null;
  if (!slot || !contact.call_hours) {
    return { variant: "channel", text: fill(lead, { number, when: "" }), number, dial };
  }
  const when = fill(resolveI18n(CONTACT_LINE_STRINGS[WHEN_KEY[slot.variant]], locale), {
    from: formatClock(contact.call_hours.from, locale),
    to: formatClock(contact.call_hours.to, locale),
    day: resolveI18n(CONTACT_WEEKDAY_NAMES[slot.day], locale),
  });
  return {
    variant: slot.variant,
    text: fill(lead, { number, when: ` ${when}` }),
    number,
    dial,
  };
}
