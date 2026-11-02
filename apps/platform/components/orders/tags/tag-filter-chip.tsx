"use client";

import { useEffect, useState } from "react";
import { Check, Tag, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useOrderTags } from "@/hooks/use-order-tags";
import { useOrderStore } from "@/store/use-order-store";
import { ORDER_TAG_SWATCH, ORDER_TAG_TONE } from "@/lib/orders/order-tags";

/**
 * "Tag" filter: narrows the orders on screen (current status tab and dates)
 * to one named tag. Hidden until the store has tags.
 */
export function TagFilterChip({ isMobile = false }: { isMobile?: boolean }) {
    const { t } = useLanguage();
    const { tags } = useOrderTags();
    const tagId = useOrderStore((s) => s.filterTagId);
    const setTagId = useOrderStore((s) => s.setFilterTagId);
    const [open, setOpen] = useState(false);
    const active = tags.find((x) => x.id === tagId) ?? null;

    // A deleted tag ends its filter.
    useEffect(() => {
        if (tagId && tags.length > 0 && !active) setTagId(null);
    }, [tagId, tags.length, active, setTagId]);

    if (tags.length === 0) return null;

    return (
        <div className="flex items-center">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-pressed={active !== null}
                        title={t("orders.tags.filterTip")}
                        className={cn(
                            "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                            isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                            active
                                ? cn(ORDER_TAG_TONE[active.color], "shadow-sm pe-9")
                                : "bg-background text-foreground/80 border-gray-200 hover:bg-gray-50 active:scale-95 dark:border-white/15 dark:hover:bg-white/5",
                        )}
                    >
                        <Tag className="w-4 h-4" aria-hidden="true" />
                        <span className="max-w-[10rem] truncate">{active ? active.name : !isMobile && t("orders.tags.filter")}</span>
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={6} collisionPadding={16} className="w-56 p-1 rounded-xl shadow-xl z-[9999] dark:bg-gray-900">
                    <ul role="listbox" className="max-h-64 overflow-y-auto">
                        {tags.map((tag) => (
                            <li key={tag.id}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={tag.id === tagId}
                                    onClick={() => {
                                        setTagId(tag.id === tagId ? null : tag.id);
                                        setOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                                >
                                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", ORDER_TAG_SWATCH[tag.color])} aria-hidden="true" />
                                    <span className="flex-1 truncate text-start">{tag.name}</span>
                                    {tag.id === tagId && <Check className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                </PopoverContent>
            </Popover>
            {active && (
                <button
                    type="button"
                    onClick={() => setTagId(null)}
                    aria-label={t("orders.tags.clearFilter")}
                    title={t("orders.tags.clearFilter")}
                    className="-ms-8 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
