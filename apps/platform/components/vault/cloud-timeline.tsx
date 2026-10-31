"use client";

import { useState } from "react";
import { Cloud, Download, History, Loader2, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { formatVaultDate } from "@/lib/vault-format";
import type { CloudVaultEntry } from "@/app/actions/vault";

interface CloudTimelineProps {
    vaults: CloudVaultEntry[];
    isLoading: boolean;
    /** File name currently being downloaded, if any. */
    downloading: string | null;
    onSelect: (filename: string) => void;
    /** File name currently being deleted, if any. */
    deleting: string | null;
    onDelete: (filename: string) => void;
}

export function CloudTimeline({ vaults, isLoading, downloading, onSelect, deleting, onDelete }: CloudTimelineProps) {
    const { t } = useLanguage();
    // Deleting is permanent, so the trash button first asks for a second tap on the same row.
    const [confirming, setConfirming] = useState<string | null>(null);

    return (
            <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
                className="bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] p-6 md:p-8 flex flex-col relative overflow-hidden shadow-[var(--card-shadow)] lg:col-span-1"
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-[var(--vault-soft)] border border-[var(--vault-border)] flex items-center justify-center">
                        <History className="w-5 h-5 text-[var(--vault-accent)]" />
                    </div>
                    <h2 className="text-xl font-semibold">{t("vault.cloud.title", "Cloud Time Machine")}</h2>
                </div>

                <p className="text-sm text-[var(--foreground-muted)] mb-6">
                    {t("vault.cloud.desc", "Restore from secure, zero-knowledge snapshots saved in your cloud bucket.")}
                </p>

                <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-[200px] scrollbar-thin scrollbar-thumb-[var(--card-border)] scrollbar-track-transparent">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-10">
                            <Loader2 className="w-6 h-6 animate-spin text-[var(--vault-accent)]" />
                        </div>
                    ) : vaults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-12 h-12 rounded-full bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center mb-3">
                                <Cloud className="w-6 h-6 text-[var(--foreground-subtle)]" />
                            </div>
                            <p className="text-sm text-[var(--foreground-muted)]">{t("vault.cloud.empty", "No cloud backups found.")}</p>
                            <p className="text-xs text-[var(--foreground-subtle)] mt-1 max-w-[200px]">{t("vault.cloud.emptyHint", "Sync an encrypted vault to start your timeline.")}</p>
                        </div>
                    ) : (
                        vaults.map((vault) => (
                            <div key={vault.name} className="bg-[var(--background)] border border-[var(--card-border)] p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 group hover:border-[var(--vault-border)] transition-all">
                                <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1 basis-40">
                                    <Cloud className="w-8 h-8 text-[var(--foreground-subtle)] group-hover:text-[var(--vault-accent)] flex-shrink-0 transition-colors" />
                                    <div className="overflow-hidden">
                                        <p className="text-sm font-medium">{vault.createdAt ? formatVaultDate(vault.createdAt) : vault.name}</p>
                                        <p className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wide">{((vault.size ?? 0) / 1024 / 1024).toFixed(2)} MB • {t("vault.cloud.sync", "Sync")}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {confirming === vault.name ? (
                                        <>
                                            <button
                                                onClick={() => { setConfirming(null); onDelete(vault.name); }}
                                                className="h-9 px-3 rounded-full bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
                                            >
                                                {t("vault.cloud.deleteConfirm", "Delete")}
                                            </button>
                                            <button
                                                onClick={() => setConfirming(null)}
                                                className="h-9 px-3 rounded-full border border-[var(--card-border)] text-xs font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                                            >
                                                {t("vault.cloud.deleteCancel", "Keep")}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => onSelect(vault.name)}
                                                disabled={downloading === vault.name || deleting === vault.name}
                                                className="w-9 h-9 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center hover:bg-[var(--vault-accent)] hover:text-[var(--vault-accent-contrast)] hover:border-transparent text-[var(--foreground-muted)] transition-colors disabled:opacity-50"
                                                aria-label={t("vault.cloud.download", "Download cloud backup")}
                                            >
                                                {downloading === vault.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => setConfirming(vault.name)}
                                                disabled={downloading === vault.name || deleting === vault.name}
                                                className="w-9 h-9 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center hover:bg-red-600 hover:text-white hover:border-transparent text-[var(--foreground-muted)] transition-colors disabled:opacity-50"
                                                aria-label={t("vault.cloud.delete", "Delete cloud backup")}
                                            >
                                                {deleting === vault.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </motion.section>
    );
}
