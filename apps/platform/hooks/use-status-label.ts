"use client";

import { useCallback } from "react";
import { useLanguage } from "@/hooks/use-language";
import { getOrderStatusLabel } from "@/lib/order-status-labels";

/**
 * Status labels bound to the active locale.
 *
 * ARCH-4: `getStatusLabel` in lib/utils returns Arabic regardless of the chosen
 * language, so an English user reads Arabic status badges on every order card.
 * Components use this instead; the plain function stays for the few call sites
 * that are not components.
 */
export function useStatusLabel(): (status: string, isReturn?: boolean) => string {
    const { language } = useLanguage();
    return useCallback(
        (status: string, isReturn?: boolean) => getOrderStatusLabel(status, language, isReturn),
        [language],
    );
}
