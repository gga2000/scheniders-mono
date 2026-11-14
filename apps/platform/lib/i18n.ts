// Centralized translation dictionary
// Supports "en" and "ar" locales
// ARCH-4: the `orders.status.*` entries are generated from the single status
// label table in lib/order-status-labels rather than typed out here, where they
// had drifted into two spellings that said different things.

import { en } from "@/lib/i18n-en";
import { ar } from "@/lib/i18n-ar";

export type Locale = "en" | "ar";

/**
 * Both dictionaries, for code that needs either language at once (exports,
 * tests). The app itself must not import this: each dictionary is ~400 kB, and
 * the language provider loads only the one in use.
 */
export const translations: Record<Locale, Record<string, string>> = { en, ar };
