"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/** The dashboard's sections below its top cards (round 15, board D1). */
export const DASHBOARD_TABS = ["overview", "delivery", "team", "products"] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

const isTab = (s: string | null): s is DashboardTab => DASHBOARD_TABS.includes(s as DashboardTab);

/**
 * The open tab, kept in `?tab=` so a link, a reload or Back opens the same one.
 * Read after mount: the page renders a skeleton until then, so the first frame
 * never shows one tab and then another.
 */
export function useDashboardTab(): [DashboardTab, (tab: DashboardTab) => void] {
    const [tab, setTab] = useState<DashboardTab>("overview");
    useEffect(() => {
        const fromUrl = new URLSearchParams(window.location.search).get("tab");
        if (isTab(fromUrl)) setTab(fromUrl); // eslint-disable-line react-hooks/set-state-in-effect -- the URL is only readable after mount
    }, []);
    const choose = useCallback((next: DashboardTab) => {
        setTab(next);
        const url = new URL(window.location.href);
        if (next === "overview") url.searchParams.delete("tab");
        else url.searchParams.set("tab", next);
        window.history.replaceState(window.history.state, "", url);
    }, []);
    return [tab, choose];
}

export function DashboardTabs({ value, onChange }: { value: DashboardTab; onChange: (tab: DashboardTab) => void }) {
    const { t } = useLanguage();
    return (
        <div role="tablist" aria-label={t("dashboard.tabs.label")} className="flex items-center gap-1 border-b border-[var(--card-border)]">
            {DASHBOARD_TABS.map((id) => {
                const selected = value === id;
                return (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        id={`dashboard-tab-${id}`}
                        aria-selected={selected}
                        aria-controls={`dashboard-panel-${id}`}
                        onClick={() => onChange(id)}
                        className={cn(
                            "relative -mb-px px-4 py-3 text-sm font-semibold transition-colors border-b-2",
                            selected
                                ? "border-foreground text-foreground"
                                : "border-transparent text-[var(--foreground-muted)] hover:text-foreground",
                        )}
                    >
                        {t(`dashboard.tabs.${id}`)}
                    </button>
                );
            })}
        </div>
    );
}
