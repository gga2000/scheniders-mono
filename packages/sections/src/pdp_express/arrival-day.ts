// =====================================================================
// Arrival day — «الوصول المتوقع» in the express receipt
// =====================================================================
// The day an order placed NOW should arrive: now + the merchant's delivery
// ETA (hours, from the shipping config), read as a Baghdad calendar day.
// Nothing is claimed without an ETA the merchant set.
//
// The day depends on the moment the shopper looks, never on when the page
// was rendered: product pages are cached, so a server-drawn date could be a
// day stale. `useArrivalDay` therefore resolves only after mount (null in
// server markup and the first client render, so hydration always matches).
// =====================================================================

import { useEffect, useState } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { xs } from "./text";

const BAGHDAD = "Asia/Baghdad";

/** Latin digits, like every price and order number in the store. */
function localeTag(locale: LocaleCode): string {
  if (locale === "ar") return "ar-IQ-u-nu-latn";
  if (locale === "ku") return "ckb-IQ-u-nu-latn";
  return "en-GB";
}

/** The Baghdad calendar day of an instant, as a comparable day number. */
function baghdadDay(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BAGHDAD,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000;
}

/** «باچر، الأربعاء 4 تشرين الثاني» — today/tomorrow named, then the date. */
export function formatArrivalDay(now: Date, etaHours: number, locale: LocaleCode): string {
  const at = new Date(now.getTime() + etaHours * 3_600_000);
  const date = new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: BAGHDAD,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(at);
  const ahead = baghdadDay(at) - baghdadDay(now);
  if (ahead === 0) return xs("arrivalToday", locale, { date });
  if (ahead === 1) return xs("arrivalTomorrow", locale, { date });
  return date;
}

/** The arrival line for an ETA, after mount; null before or without one. */
export function useArrivalDay(etaHours: number | null, locale: LocaleCode): string | null {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    setLine(etaHours !== null && etaHours > 0 ? formatArrivalDay(new Date(), etaHours, locale) : null);
  }, [etaHours, locale]);
  return line;
}
