"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { SETTINGS_SECTION_ICONS } from "@/components/settings/settings-icons";
import { useLanguage } from "@/hooks/use-language";
import type { SettingsAttentionItem } from "@/lib/settings-attention";
import {
    SETTINGS_GROUPS,
    SETTINGS_SECTIONS,
    searchSettings,
    type SettingsSearchEntry,
    type SettingsSectionId,
} from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

/** Which section each attention item points at, for the dot on its row. */
const ATTENTION_SECTION: Record<SettingsAttentionItem["kind"], SettingsSectionId> = {
    wallet: "billing",
    "staff-alerts": "staff-alerts",
    whatsapp: "business",
};

/**
 * The Settings list: a search box that finds the exact setting, the overview,
 * then every section in its group. A dot marks a section that needs the shop.
 */
export function SettingsNav({
    active,
    attention,
    onOpen,
}: {
    active: SettingsSectionId;
    attention: readonly SettingsAttentionItem[];
    onOpen: (section: SettingsSectionId, focus?: string) => void;
}) {
    const { t } = useLanguage();
    const [query, setQuery] = useState("");
    const results = useMemo(() => searchSettings(query, t), [query, t]);
    const flagged = new Set(attention.map((a) => ATTENTION_SECTION[a.kind]));
    const sectionTitle = (id: SettingsSectionId) => t(SETTINGS_SECTIONS.find((s) => s.id === id)?.title ?? "");
    const groupTitle = (id: SettingsSectionId) => {
        const group = SETTINGS_SECTIONS.find((s) => s.id === id)?.group;
        return group ? t(SETTINGS_GROUPS.find((g) => g.id === group)?.title ?? "") : "";
    };

    const pick = (entry: SettingsSearchEntry) => {
        setQuery("");
        onOpen(entry.section, entry.focus);
    };

    return (
        <nav aria-label={t("settings.page.title")} className="pastel-card relative flex flex-col gap-px p-2.5">
            <div className="relative mb-1.5">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="search"
                    role="combobox"
                    aria-expanded={query.trim() !== ""}
                    aria-controls="settings-search-results"
                    aria-label={t("settings.page.search")}
                    placeholder={t("settings.page.search")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && results[0]) pick(results[0]);
                        if (e.key === "Escape") setQuery("");
                    }}
                    className="h-9 w-full rounded-xl border border-(--card-border) bg-(--background-soft) pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-(--ink) focus:bg-background focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label={t("settings.page.clearSearch")}
                        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
                {query.trim() !== "" && (
                    <div
                        id="settings-search-results"
                        role="listbox"
                        className="absolute inset-x-0 top-11 z-20 rounded-2xl border border-(--card-border) bg-background p-1.5 shadow-xl"
                    >
                        {results.length === 0 ? (
                            <p className="px-3 py-2.5 text-sm text-muted-foreground">
                                <bdi>{t("settings.page.noResults", { q: query.trim() })}</bdi>
                            </p>
                        ) : (
                            results.map((entry, i) => {
                                const Icon = SETTINGS_SECTION_ICONS[entry.section];
                                return (
                                    <button
                                        key={entry.focus}
                                        type="button"
                                        role="option"
                                        aria-selected={i === 0}
                                        onClick={() => pick(entry)}
                                        className={cn(
                                            "flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-(--background)",
                                            i === 0 && "bg-(--background-soft)",
                                        )}
                                    >
                                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-foreground"><bdi>{t(entry.label)}</bdi></span>
                                            <span className="block text-xs text-muted-foreground">
                                                <bdi>{groupTitle(entry.section)}</bdi> · <bdi>{sectionTitle(entry.section)}</bdi>
                                            </span>
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            <NavItem id="overview" active={active} onOpen={onOpen} count={attention.length} />

            {SETTINGS_GROUPS.map((group) => (
                <div key={group.id} className="flex flex-col gap-px">
                    <p className="mx-2 mb-1 mt-3 text-[11px] font-semibold text-muted-foreground">{t(group.title)}</p>
                    {SETTINGS_SECTIONS.filter((s) => s.group === group.id).map((s) => (
                        <NavItem key={s.id} id={s.id} active={active} onOpen={onOpen} flagged={flagged.has(s.id)} />
                    ))}
                </div>
            ))}
        </nav>
    );
}

function NavItem({
    id,
    active,
    onOpen,
    count = 0,
    flagged = false,
}: {
    id: SettingsSectionId;
    active: SettingsSectionId;
    onOpen: (section: SettingsSectionId) => void;
    count?: number;
    flagged?: boolean;
}) {
    const { t } = useLanguage();
    const Icon = SETTINGS_SECTION_ICONS[id];
    const on = id === active;
    const title = SETTINGS_SECTIONS.find((s) => s.id === id)?.title ?? "";
    return (
        <button
            type="button"
            onClick={() => onOpen(id)}
            aria-current={on ? "page" : undefined}
            className={cn(
                "flex h-8 items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors",
                on ? "bg-(--ink) text-white" : "text-foreground/85 hover:bg-(--background)",
            )}
        >
            <Icon className={cn("h-4 w-4 shrink-0", on ? "text-white" : "text-muted-foreground")} />
            <span className="truncate">{t(title)}</span>
            {count > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                    {count}
                </span>
            )}
            {flagged && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label={t("settings.overview.attention")} />}
        </button>
    );
}
