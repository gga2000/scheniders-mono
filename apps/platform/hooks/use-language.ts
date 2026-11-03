"use client";

import { useContext } from "react";
import { LanguageContext } from "@/components/providers/language-provider";

export function useLanguage() {
    return useContext(LanguageContext);
}

/**
 * The direction for a line of translated copy. The app stays LTR, but an Arabic
 * sentence holding a PO number or a Latin name must be laid out right to left
 * or its words and full stop land in the wrong order. Pair it with `text-left`
 * so the line keeps the app's alignment.
 */
export function useTextDir(): "rtl" | "ltr" {
    return useContext(LanguageContext).language === "ar" ? "rtl" : "ltr";
}
