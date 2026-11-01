"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BarChart3, Check, ChevronDown, Columns3, FolderTree, Grid3X3, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useProductStore, type ViewMode } from "@/store/use-product-store";

const PRIMARY = [
    { mode: "grid", icon: Grid3X3, label: "products.views.grid" },
    { mode: "list", icon: List, label: "products.views.list" },
] as const;

const MORE = [
    { mode: "category", icon: FolderTree, label: "products.views.category" },
    { mode: "kanban", icon: Columns3, label: "products.views.kanban" },
    { mode: "heatmap", icon: BarChart3, label: "products.views.heatmap" },
] as const;

const itemClasses =
    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground outline-none cursor-pointer data-[highlighted]:bg-[var(--background)]";

interface ViewModeSwitcherProps {
    /** The margin heatmap shows cost, so only products.manage gets it. */
    canSeeHeatmap: boolean;
}

/**
 * Grid and list stay one click away; the rarer views sit in one labelled
 * menu, which names the active one when it is in use.
 */
export function ViewModeSwitcher({ canSeeHeatmap }: ViewModeSwitcherProps) {
    const { t } = useLanguage();
    const viewMode = useProductStore((s) => s.viewMode);
    const setViewMode = useProductStore((s) => s.setViewMode);
    const more = MORE.filter((v) => v.mode !== "heatmap" || canSeeHeatmap);
    const activeMore = more.find((v) => v.mode === viewMode);

    return (
        <div className="flex items-center bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
            {PRIMARY.map(({ mode, icon: Icon, label }) => (
                <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={cn(
                        "relative p-2 rounded-lg transition-all before:absolute before:-inset-1.5 before:content-['']",
                        viewMode === mode ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                    )}
                    title={t(label)}
                    aria-label={t(label)}
                    aria-pressed={viewMode === mode}
                >
                    <Icon className="w-4 h-4" />
                </button>
            ))}
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm transition-all",
                            activeMore ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                        )}
                    >
                        {activeMore ? <activeMore.icon className="w-4 h-4" /> : null}
                        {activeMore ? t(activeMore.label) : t("products.views.more")}
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="end"
                        sideOffset={6}
                        className="z-50 w-52 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] p-1"
                    >
                        <DropdownMenu.RadioGroup value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                            {more.map(({ mode, icon: Icon, label }) => (
                                <DropdownMenu.RadioItem key={mode} value={mode} className={itemClasses}>
                                    <Icon className="w-4 h-4 text-muted" />
                                    <span className="flex-1">{t(label)}</span>
                                    <DropdownMenu.ItemIndicator>
                                        <Check className="w-4 h-4" />
                                    </DropdownMenu.ItemIndicator>
                                </DropdownMenu.RadioItem>
                            ))}
                        </DropdownMenu.RadioGroup>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    );
}
