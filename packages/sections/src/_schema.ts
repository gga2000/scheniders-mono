// =====================================================================
// Section schema helpers
// =====================================================================
// Small Zod fragments reused across section files. Centralising these
// keeps section definitions short and locks every section onto the same
// I18nString shape (matches `I18nString` from `@scheniders/shared`).
// =====================================================================

import { z } from "zod";

/** Zod schema mirroring `I18nString` (Partial<Record<LocaleCode, string>>). */
export const i18nStringSchema = z
  .object({
    en: z.string().optional(),
    ar: z.string().optional(),
    ku: z.string().optional(),
  })
  .passthrough();

export type I18nStringValue = z.infer<typeof i18nStringSchema>;

/** Optional, may be undefined. */
export const i18nStringOptional = i18nStringSchema.optional();

/** Hex / URL strings — kept loose so editor placeholders work. */
export const urlString = z.string();
