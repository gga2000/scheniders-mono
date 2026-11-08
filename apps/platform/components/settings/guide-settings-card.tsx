"use client";

import Link from "next/link";
import { Compass, RotateCcw } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";

/** Brings the setup guide's «دليلك» list back, or replays the guide from the start. Admins only. */
export function GuideSettingsCard() {
    const { t } = useLanguage();
    const { role } = useAuth();
    if (role !== "admin") return null;
    return (
        <div className="pastel-card p-6" data-testid="guide-settings">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-(--pastel-yellow) flex items-center justify-center">
                    <Compass className="h-4 w-4 text-neutral-800" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{t("guide.settings.title")}</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">{t("guide.settings.body")}</p>
            <div className="flex flex-wrap gap-2">
                <Link
                    href="/dashboard?guide=show"
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-(--ink) px-4 text-sm font-semibold text-white hover:opacity-90"
                >
                    <Compass className="h-4 w-4" />
                    {t("guide.settings.show")}
                </Link>
                <Link
                    href="/dashboard?guide=start"
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-(--card-border) px-4 text-sm font-semibold text-foreground hover:bg-(--background)"
                >
                    <RotateCcw className="h-4 w-4" />
                    {t("guide.settings.replay")}
                </Link>
            </div>
        </div>
    );
}
