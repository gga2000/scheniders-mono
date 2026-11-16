"use client";

import { useEffect, useState } from "react";
import { Eye, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";

/** "28:14" for the time left, never below zero. */
export function formatTimeLeft(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * A support staff member's look-only "view as merchant": a red bar on every
 * page with the time left, and once the 30 minutes are up a screen that only
 * signs out. The database refuses every change this sign-in tries to make.
 */
export function SupportViewBanner() {
    const { supportView, signOut } = useAuth();
    const { t } = useLanguage();
    const [now, setNow] = useState(() => Date.now());
    const live = supportView !== null && supportView.expiresAt !== null;

    useEffect(() => {
        if (!live) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [live]);

    if (supportView === null) return null;

    const left = supportView.expiresAt ? Date.parse(supportView.expiresAt) - now : 0;
    if (left <= 0) {
        return (
            <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
                <Eye className="h-10 w-10 text-red-600" />
                <p className="text-lg font-semibold text-foreground">{t("support.view.ended")}</p>
                <button
                    type="button"
                    onClick={() => void signOut()}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                >
                    <LogOut className="h-4 w-4" />
                    {t("support.view.signOut")}
                </button>
            </div>
        );
    }

    return (
        <div
            role="status"
            className="fixed inset-x-0 top-0 z-[1000] flex items-center justify-center gap-3 bg-red-600 px-4 py-1.5 text-sm font-semibold text-white"
        >
            <Eye className="h-4 w-4 shrink-0" />
            <span>{t("support.view.banner")}</span>
            <span className="tabular-nums">{t("support.view.left", { time: formatTimeLeft(left) })}</span>
            <button
                type="button"
                onClick={() => void signOut()}
                className="ml-2 inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-0.5 text-xs font-semibold hover:bg-white/25"
            >
                <LogOut className="h-3.5 w-3.5" />
                {t("support.view.end")}
            </button>
        </div>
    );
}
