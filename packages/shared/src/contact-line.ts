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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isClock(v: unknown): v is string {
  return typeof v === "string" && CLOCK_RE.test(v);
}

function parseCallHours(raw: unknown): Required<StoreCallHours> | null {
  if (!isRecord(raw)) return null;
  const { days, from, to } = raw;
  const tz = raw.tz === undefined ? DEFAULT_CONTACT_TIMEZONE : raw.tz;
  if (!Array.isArray(days) || days.length === 0) return null;
  if (!days.every((d): d is ContactWeekday => CONTACT_WEEKDAYS.some((w) => w === d))) return null;
  if (!isClock(from) || !isClock(to) || clockMinutes(from) >= clockMinutes(to)) return null;
  if (typeof tz !== "string" || !isTimeZone(tz)) return null;
  return { days, from, to, tz };
}

/** `commerce.contact.name_i18n`: an object whose ar / en / ku are each
 *  absent or a string; anything else is no name. Read by hand (not zod)
 *  because this module ships to every shopper's browser. Unknown keys are
 *  dropped. */
export function parseContactName(raw: unknown): I18nString | null {
  if (!isRecord(raw)) return null;
  const name: I18nString = {};
  for (const key of ["ar", "en", "ku"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (typeof v !== "string") return null;
    name[key] = v;
  }
  return name;
}

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
  if (!isRecord(raw) || typeof raw.call_number !== "string") return null;
  const call_number = normalizeIraqiMobile(raw.call_number);
  if (call_number === null) return null;
  const contact: ParsedStoreContact = { call_number };
  const call_hours = parseCallHours(raw.call_hours);
  if (call_hours) contact.call_hours = call_hours;
  if (typeof raw.whatsapp_confirm === "boolean") contact.whatsapp_confirm = raw.whatsapp_confirm;
  const name_i18n = parseContactName(raw.name_i18n);
  if (name_i18n) contact.name_i18n = name_i18n;
  return contact;
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
