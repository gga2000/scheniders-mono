"use client";

import { Activity, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { formatVaultDate } from "@/lib/vault-format";
import type { VaultActivityEntry } from "@/lib/vault-utils";

interface BackupHealthProps {
    activity: VaultActivityEntry[];
    isLoading: boolean;
    /** True when the activity could not be loaded. */
    failed: boolean;
}

const ACTION_LABELS = {
    automated_csv_backup: ["vault.health.action.auto", "Automatic backup"],
    VAULT_EXPORT: ["vault.health.action.export", "Download"],
    VAULT_CLOUD_SYNC: ["vault.health.action.sync", "Cloud copy saved"],
    VAULT_CLOUD_DOWNLOAD: ["vault.health.action.cloudDownload", "Cloud copy downloaded"],
    VAULT_CLOUD_DELETE: ["vault.health.action.cloudDelete", "Cloud copy deleted"],
    VAULT_RESTORE: ["vault.health.action.restore", "Restore"],
} as const;

type KnownAction = keyof typeof ACTION_LABELS;

function isKnownAction(action: string): action is KnownAction {
    return action in ACTION_LABELS;
}

/** An automatic run is healthy only when it recorded no failed files. */
function autoRunFailed(entry: VaultActivityEntry): boolean {
    const failures = entry.details.failures;
    return Array.isArray(failures) ? failures.length > 0 : typeof failures === "object" && failures !== null && Object.keys(failures).length > 0;
}

export function BackupHealth({ activity, isLoading, failed }: BackupHealthProps) {
    const { t } = useLanguage();
    const lastAuto = activity.find((entry) => entry.action === "automated_csv_backup");
    const autoOk = lastAuto ? !autoRunFailed(lastAuto) : false;

    return (
        <section className="bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] p-6 md:p-8 shadow-[var(--card-shadow)]">
            <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[var(--vault-soft)] border border-[var(--vault-border)] flex items-center justify-center">
                    <Activity className="w-5 h-5 text-[var(--vault-accent)]" />
                </div>
                <h2 className="text-xl font-semibold">{t("vault.health.title", "Backup health")}</h2>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--vault-accent)]" />
                </div>
            ) : failed ? (
                <p className="text-sm text-[var(--foreground-muted)]">{t("vault.health.loadFailed", "Could not load backup activity.")}</p>
            ) : (
                <>
                    <div className="flex items-start gap-3 mb-5">
                        {lastAuto && autoOk ? (
                            <CheckCircle2 className="w-5 h-5 mt-0.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                        ) : (
                            <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        )}
                        <div>
                            <p className="text-base font-medium">
                                {lastAuto
                                    ? autoOk
                                        ? t("vault.health.autoOk", "Last automatic backup: {when}", { when: formatVaultDate(lastAuto.createdAt) })
                                        : t("vault.health.autoPartial", "Last automatic backup had problems: {when}", { when: formatVaultDate(lastAuto.createdAt) })
                                    : t("vault.health.autoNone", "No automatic backup has run for this store yet.")}
                            </p>
                            <p className="text-xs text-[var(--foreground-subtle)] mt-0.5">
                                {t("vault.health.autoHint", "Runs every night and keeps the newest 14 copies.")}
                            </p>
                        </div>
                    </div>

                    {activity.length > 0 && (
                        <ul className="divide-y divide-[var(--card-border)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                            {activity.map((entry) => {
                                const label = isKnownAction(entry.action) ? t(ACTION_LABELS[entry.action][0], ACTION_LABELS[entry.action][1]) : entry.action;
                                return (
                                    <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm bg-[var(--background)]">
                                        <span className="truncate">{label}</span>
                                        <span className="text-xs text-[var(--foreground-subtle)] flex-shrink-0">{formatVaultDate(entry.createdAt)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}
        </section>
    );
}
