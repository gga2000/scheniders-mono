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

export function HeaderBar({ businessName, status, storefrontUrl }: HeaderBarProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-xl font-bold text-foreground truncate">{businessName}</h1>
                <StatusPill status={status} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <a
                    href={storefrontUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Visit store
                </a>
                <Link
                    href="/store/edit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
                >
                    <Pencil className="w-3.5 h-3.5" />
                    Customize
                </Link>
            </div>
        </div>
    );
}
