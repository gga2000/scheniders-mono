"use client";

import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";

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
}

function StatusPill({ status }: { status: StoreStatus }) {
    if (status.published && !status.hasDraft) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
            </span>
        );
    }
    if (status.hasDraft) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Unpublished changes
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            Draft
        </span>
    );
}

export function HeaderBar({ businessName, status, storefrontUrl, published }: HeaderBarProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">{businessName}</h1>
                <StatusPill status={status} />
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
                        Visit store
                    </a>
                ) : (
                    <span
                        aria-disabled="true"
                        title="Publish your store first"
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-border bg-(--card-bg) px-3 py-2 text-sm font-medium text-muted-foreground/50 shadow-(--card-shadow) opacity-60"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Visit store
                    </span>
                )}
                <Link
                    href="/store/edit"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                >
                    <Pencil className="w-3.5 h-3.5" />
                    Customize
                </Link>
            </div>
        </div>
    );
}
