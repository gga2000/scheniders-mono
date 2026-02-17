"use client";

import { useContext } from "react";
import { LanguageContext } from "@/components/providers/language-provider";

export function useLanguage() {
    return useContext(LanguageContext);
}
