"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useProductStore, type GridDensity } from "@/store/use-product-store";

export type { GridDensity };

/**
 * Density presets map to a responsive [xs, sm, md, lg, xl] column-count vector.
 * Index into the array is chosen by computeColumnCount(width) based on Tailwind breakpoints.
 *
 * Exported so the grid and this toggle stay in sync — one source of truth.
 */
export const DENSITY_COLUMNS: Record<GridDensity, readonly [number, number, number, number, number]> = {
    comfy: [1, 2, 2, 3, 3],
    normal: [1, 2, 3, 4, 4],
    compact: [1, 2, 3, 4, 5],
    // Tight is the only preset with two columns on phones; one column keeps swipe actions.
    tight: [2, 3, 3, 5, 6],
};

/**
 * Shared column-count resolver. Kept here (next to DENSITY_COLUMNS) so any consumer
 * (grid, hook, test) uses identical rules.
 */
export function computeColumnCount(width: number, density: GridDensity): number {
    const cols = DENSITY_COLUMNS[density];
    // Tailwind breakpoints: sm=640, md=768, lg=1024, xl=1280
    if (width < 640) return cols[0];
    if (width < 768) return cols[1];
    if (width < 1024) return cols[2];
    if (width < 1280) return cols[3];
    return cols[4];
}

const PRESETS: { id: GridDensity; labelKey: string }[] = [
    { id: "comfy", labelKey: "products.density.comfy" },
    { id: "normal", labelKey: "products.density.normal" },
    { id: "compact", labelKey: "products.density.compact" },
    { id: "tight", labelKey: "products.density.tight" },
];

const itemClasses =
    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground outline-none cursor-pointer data-[highlighted]:bg-[var(--background)]";

/**
 * Card size and grouping in one labelled menu. Four unlabelled density icons
 * plus a group toggle read as a wall of icons next to the view switcher.
 */
export function DensityToggle() {
    const { t } = useLanguage();
    const density = useProductStore((s) => s.gridDensity);
    const setDensity = useProductStore((s) => s.setGridDensity);
    const groupByCategory = useProductStore((s) => s.gridGroupByCategory);
    const setGroupByCategory = useProductStore((s) => s.setGridGroupByCategory);
    const current = PRESETS.find((p) => p.id === density) ?? PRESETS[1];

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground hover:bg-[var(--card-bg)] transition-colors"
                >
                    <SlidersHorizontal className="w-4 h-4 text-muted" />
                    <span>{t(current.labelKey)}</span>
                    {groupByCategory && <span className="text-muted">· {t("products.density.grouped")}</span>}
                    <ChevronDown className="w-3.5 h-3.5 text-muted" />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 w-56 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] p-1"
                >
                    <DropdownMenu.Label className="px-3 pt-2 pb-1 text-xs font-medium text-muted">
                        {t("products.density.title")}
                    </DropdownMenu.Label>
                    <DropdownMenu.RadioGroup value={density} onValueChange={(v) => setDensity(v as GridDensity)}>
                        {PRESETS.map(({ id, labelKey }) => (
                            <DropdownMenu.RadioItem key={id} value={id} className={itemClasses}>
                                <span className="w-4">
                                    <DropdownMenu.ItemIndicator>
                                        <Check className="w-4 h-4" />
                                    </DropdownMenu.ItemIndicator>
                                </span>
                                {t(labelKey)}
                            </DropdownMenu.RadioItem>
                        ))}
                    </DropdownMenu.RadioGroup>
                    <DropdownMenu.Separator className="h-px bg-[var(--card-border)] my-1" />
                    <DropdownMenu.CheckboxItem
                        checked={groupByCategory}
                        onCheckedChange={(v) => setGroupByCategory(v === true)}
                        className={itemClasses}
                    >
                        <span className="w-4">
                            <DropdownMenu.ItemIndicator>
                                <Check className="w-4 h-4" />
                            </DropdownMenu.ItemIndicator>
                        </span>
                        {t("products.groupByCategory")}
                    </DropdownMenu.CheckboxItem>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
