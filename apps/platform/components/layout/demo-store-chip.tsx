"use client";

import { FlaskConical } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { useLanguage } from "@/hooks/use-language";

/**
 * «أرقام مثال» in the top bar of the demo store (Fermi B13), so every screen
 * Ali records, the money ones above all, says its numbers are invented.
 */
export function DemoStoreChip() {
    const { t } = useLanguage();
    const { data: tenant } = useTenant();
    if (!tenant?.is_demo) return null;
    return (
        <span
            data-testid="demo-store-chip"
            title={t("layout.demoStore.hint")}
            className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
        >
            <FlaskConical className="h-3.5 w-3.5" />
            <bdi>{t("layout.demoStore.chip")}</bdi>
        </span>
    );
}
