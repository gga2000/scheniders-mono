"use client";

import { LayoutGrid, Columns3, Columns4, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
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

const PRESETS: { id: GridDensity; Icon: typeof LayoutGrid; labelKey: string }[] = [
    { id: "comfy", Icon: LayoutGrid, labelKey: "products.density.comfy" },
    { id: "normal", Icon: Columns3, labelKey: "products.density.normal" },
    { id: "compact", Icon: Columns4, labelKey: "products.density.compact" },
    { id: "tight", Icon: Rows3, labelKey: "products.density.tight" },
];

export function DensityToggle() {
    const { t } = useLanguage();
    const density = useProductStore((s) => s.gridDensity);
    const setDensity = useProductStore((s) => s.setGridDensity);

    return (
        <div
            role="group"
            aria-label={t("products.density.title")}
            className="flex bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]"
        >
            {PRESETS.map(({ id, Icon, labelKey }) => {
                const active = density === id;
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setDensity(id)}
                        aria-pressed={active}
                        title={t(labelKey)}
                        className={cn(
                            "p-2 rounded-lg transition-all",
                            active
                                ? "bg-[var(--foreground)] text-white"
                                : "text-muted hover:text-foreground"
                        )}
                    >
                        <Icon className="w-4 h-4" />
                    </button>
                );
            })}
        </div>
    );
}
