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

const ON = "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]";
const OFF = "border-[var(--card-border)] hover:bg-[var(--background)]";
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
        <>
            <div className="flex flex-wrap items-center gap-4 border-b border-[var(--card-border)] px-5 py-4">
                <p className="me-auto flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-semibold leading-none tabular-nums text-foreground">{selectedCount}</span>
                    <span className="text-muted">{t("printing.runCount")}</span>
                </p>
                <label className="flex h-10 w-full max-w-xs items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3">
                    <Search className="h-4 w-4 shrink-0 text-muted" />
                    <input
                        value={query}
                        onChange={(e) => onQuery(e.target.value)}
                        placeholder={t("printing.searchPlaceholder")}
                        className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                    />
                </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--card-border)] px-5 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        aria-pressed={group === null}
                        onClick={() => onGroup(null)}
                        className={cn(pill, group === null ? ON : OFF)}
                    >
                        {t("printing.allGroups")}
                    </button>
                    {groups.map((g) => (
                        <button
                            key={g.key}
                            type="button"
                            aria-pressed={group === g.key}
                            onClick={() => onGroup(group === g.key ? null : g.key)}
                            className={cn(pill, group === g.key ? ON : OFF)}
                        >
                            {g.label}
                            <span className="font-mono tabular-nums opacity-70">{g.count}</span>
                        </button>
                    ))}
                </div>
                <div className="ms-auto flex flex-wrap gap-1.5">
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
            </div>
            <label className="flex cursor-pointer items-center gap-3 border-b border-[var(--card-border)] px-5 py-2 text-xs text-muted">
                <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={selectableCount === 0}
                    onChange={onSelectAll}
                    className="h-[18px] w-[18px] cursor-pointer rounded-md accent-[var(--foreground)]"
                />
                {t("printing.selectAllInView", { count: selectableCount })}
            </label>
        </>
    );
}
