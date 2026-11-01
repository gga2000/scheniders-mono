"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useMetaAdsConnection, useMetaAdsReport } from "@/hooks/use-meta-ads";
import { canAccessRoute } from "@/lib/route-permissions";

function Chip({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col rounded-full border border-white/20 bg-white/40 px-4 py-1.5 leading-tight shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] ring-1 ring-black/5 backdrop-blur-md orders-toolbar-pill">
            <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
            <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
        </div>
    );
}

/** Today's Meta numbers for the Orders header. Read-only; shown only to people who may open /ads. */
export function AdsTodayChips() {
    const { t } = useLanguage();
    const { role, permissions } = useAuth();
    const allowed = canAccessRoute("/ads", role, permissions);
    const connection = useMetaAdsConnection();
    const { current } = useMetaAdsReport("today", false);

    if (!allowed || !connection.data || !current.data) return null;
    const { spendIqd, results } = current.data;
    const cpa = results > 0 ? Math.round(spendIqd / results) : null;

    return (
        <Link href="/ads" className="flex items-center gap-2" title={t("ads.title")} aria-label={t("ads.title")}>
            <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden />
            <Chip label={t("ads.todaySpend")} value={formatIQD(spendIqd)} />
            <Chip label={t("ads.todayMetaOrders")} value={results.toLocaleString()} />
            <Chip label={t("ads.todayCpa")} value={cpa === null ? "—" : formatIQD(cpa)} />
        </Link>
    );
}
