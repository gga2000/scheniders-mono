"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { DESK_CHIP_TONES, type DeskChipTone } from "@/components/printing/desk-chip";

/** Problem filters: orders that can't print, or were printed before. */
export type DeskIssue = "blocked" | "printed";

const ISSUES: ReadonlyArray<{ key: DeskIssue; tone: DeskChipTone; labelKey: string }> = [
    { key: "blocked", tone: "bad", labelKey: "printing.issueBlocked" },
    { key: "printed", tone: "warn", labelKey: "printing.issuePrinted" },
];

interface DeskToolbarProps {
    selectedCount: number;
    query: string;
    onQuery: (query: string) => void;
    /** Packing groups, in packing order. */
    groups: ReadonlyArray<{ key: string; label: string; count: number }>;
    group: string | null;
    onGroup: (group: string | null) => void;
    issueCounts: Record<DeskIssue, number>;
    issue: DeskIssue | null;
    onIssue: (issue: DeskIssue | null) => void;
    /** Printable orders in the current view, and whether all of them are ticked. */
    selectableCount: number;
    allSelected: boolean;
    onSelectAll: () => void;
}

const pill = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors";

export function DeskToolbar({
    selectedCount,
    query,
    onQuery,
    groups,
    group,
    onGroup,
    issueCounts,
    issue,
    onIssue,
    selectableCount,
    allSelected,
    onSelectAll,
}: DeskToolbarProps) {
    const { t } = useLanguage();
    return (
        <div className="sticky top-0 z-20 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
            <div className="flex flex-wrap items-center gap-3 px-4 pt-3">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--card-border)] px-3 py-1.5">
                    <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectableCount === 0}
                        onChange={onSelectAll}
                        aria-label={t("printing.selectAllInView", { count: selectableCount })}
                        className="h-4 w-4 cursor-pointer rounded accent-[var(--foreground)]"
                    />
                    <span className="font-mono text-xl font-semibold leading-none tabular-nums text-foreground">{selectedCount}</span>
                    <span className="text-sm text-muted">{t("printing.runCount")}</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                    {ISSUES.filter((i) => issueCounts[i.key] > 0).map((i) => (
                        <button
                            key={i.key}
                            type="button"
                            aria-pressed={issue === i.key}
                            onClick={() => onIssue(issue === i.key ? null : i.key)}
                            className={cn(pill, "border-transparent", DESK_CHIP_TONES[i.tone], issue === i.key && "ring-[1.5px] ring-current")}
                        >
                            <span className="font-mono tabular-nums">{issueCounts[i.key]}</span>
                            {t(i.labelKey)}
                        </button>
                    ))}
                </div>
                <label className="ms-auto flex h-9 w-full max-w-[280px] items-center gap-2 rounded-xl border border-[var(--card-border)] px-3">
                    <Search className="h-4 w-4 shrink-0 text-muted" />
                    <input
                        value={query}
                        onChange={(e) => onQuery(e.target.value)}
                        placeholder={t("printing.searchPlaceholder")}
                        className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                    />
                </label>
            </div>
            <div role="tablist" aria-label={t("printing.groupsLabel")} className="flex gap-1 overflow-x-auto px-4 pb-0 pt-3">
                {[{ key: null, label: t("printing.allGroups"), count: groups.reduce((n, g) => n + g.count, 0) }, ...groups].map((g) => {
                    const on = group === g.key;
                    return (
                        <button
                            key={g.key ?? "all"}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => onGroup(g.key)}
                            className={cn(
                                "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors",
                                on ? "border-[var(--foreground)] font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground"
                            )}
                        >
                            {g.label}
                            <span className={cn("rounded-full px-1.5 font-mono text-[11px] tabular-nums", on ? "bg-[var(--foreground)] text-[var(--background)]" : "bg-[var(--background)]")}>
                                {g.count}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
