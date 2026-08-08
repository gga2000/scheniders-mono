"use client";

import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import type { LocaleCode } from "@scheniders/shared";
import { STRINGS, t } from "@/lib/editor-i18n";

interface StoreStatus {
    published: boolean;
    hasDraft: boolean;
}

interface HeaderBarProps {
    businessName: string;
    status: StoreStatus;
    storefrontUrl: string;
    /** When the store is not yet published the public URL 404s, so the
     * "Visit store" control is rendered disabled instead of navigating. */
    published: boolean;
    /** A fresh store routes the primary CTA into the onboarding wizard
     * instead of dropping the merchant into an empty editor. */
    isBrandNew?: boolean;
    /** Hub chrome locale — the store's `default_locale` (UX2-14). */
    locale: LocaleCode;
}

function StatusPill({ status, locale }: { status: StoreStatus; locale: LocaleCode }) {
    if (status.published && !status.hasDraft) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t(STRINGS.command_center.status_live, locale)}
            </span>
        );
    }
    if (status.hasDraft) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {t(STRINGS.command_center.status_unpublished_changes, locale)}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            {t(STRINGS.command_center.status_draft, locale)}
        </span>
    );
}

export function HeaderBar({ businessName, status, storefrontUrl, published, isBrandNew = false, locale }: HeaderBarProps) {
    const visitStore = t(STRINGS.command_center.visit_store, locale);

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">{businessName}</h1>
                <StatusPill status={status} locale={locale} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {published ? (
                    <a
                        href={storefrontUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-(--card-bg) px-3 py-2 text-sm font-medium text-muted-foreground shadow-(--card-shadow) transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {visitStore}
                    </a>
                ) : (
                    <span
                        aria-disabled="true"
                        title={t(STRINGS.command_center.visit_store_disabled_title, locale)}
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-border bg-(--card-bg) px-3 py-2 text-sm font-medium text-muted-foreground/50 shadow-(--card-shadow) opacity-60"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {visitStore}
                    </span>
                )}
                <Link
                    href={isBrandNew ? "/store/onboarding" : "/store/edit"}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                >
                    <Pencil className="w-3.5 h-3.5" />
                    {isBrandNew
                        ? t(STRINGS.command_center.set_up_store, locale)
                        : t(STRINGS.command_center.customize, locale)}
                </Link>
            </div>
        </div>
    );
}
