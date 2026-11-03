"use client";

import { Truck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/order";
import { PRIME_BAND_ORDER_STATUSES, usePrimeBand } from "./use-prime-band";

/**
 * The truck in the card's action capsule: shows or hides this card's Prime
 * band. Blue while the band shows. Only on cards whose parcel is with Prime.
 */
export function PrimeTrackToggle({ order, docked }: { order: Pick<Order, "id" | "status">; docked: boolean }) {
    // Only cards that can carry the band subscribe to the Prime queries.
    if (!PRIME_BAND_ORDER_STATUSES.has(order.status)) return null;
    return <PrimeTrackToggleFor order={order} docked={docked} />;
}

function PrimeTrackToggleFor({ order, docked }: { order: Pick<Order, "id" | "status">; docked: boolean }) {
    const { t } = useLanguage();
    const band = usePrimeBand(order);
    if (!band.available) return null;
    const label = t(band.shown ? "orders.prime.track.hide" : "orders.prime.track.show");
    return (
        <button
            type="button"
            data-prime-track-toggle={band.shown ? "on" : "off"}
            aria-pressed={band.shown}
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.stopPropagation();
                band.toggle();
            }}
            className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl transition-all",
                band.shown
                    ? "bg-[#E8EEF8] text-[#1F3F75] hover:bg-[#DCE4F2] dark:bg-sky-400/15 dark:text-sky-200 dark:hover:bg-sky-400/25"
                    : cn(
                          "text-foreground hover:bg-[var(--card-border)] dark:text-[#A1A1A1] dark:hover:bg-white/5 dark:hover:text-white",
                          docked ? "bg-transparent" : "border border-[var(--card-border)] bg-[var(--background)] dark:border-white/5 dark:bg-black/20",
                      ),
            )}
        >
            <Truck className="h-4 w-4" />
        </button>
    );
}
