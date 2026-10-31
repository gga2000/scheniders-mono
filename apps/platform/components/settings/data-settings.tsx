"use client";

import Link from "next/link";
import { Database, ArrowRight } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

/**
 * Backups, exports and restores live in the Data Vault: encrypted, admin-only,
 * validated on restore and audited. Settings only points there, so there is
 * one place to take and restore a backup.
 */
export function DataSettings() {
    const { t } = useLanguage();

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("settings.data.title", "Data Management")}</h2>
                <p className="text-muted">{t("settings.data.subtitle", "Backups, exports and restores are in the Data Vault.")}</p>
            </div>

            <div className="pastel-card p-6 max-w-xl">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-[var(--pastel-green)] flex items-center justify-center">
                        <Database className="h-4 w-4 text-green-700" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{t("settings.data.vaultTitle", "Data Vault")}</h3>
                </div>
                <p className="text-sm text-muted mb-6">
                    {t("settings.data.vaultDesc", "Download encrypted, Excel or CSV backups, keep cloud copies, and restore with a preview before anything is written.")}
                </p>
                <Link
                    href="/vault"
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] text-foreground hover:bg-[var(--card-bg-hover)] transition-all font-medium"
                >
                    {t("settings.data.openVault", "Open Data Vault")}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        </div>
    );
}
