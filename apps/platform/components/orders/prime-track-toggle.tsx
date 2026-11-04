"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { useOrderStore } from "@/store/use-order-store";

/**
 * Tools-bar button that shows or hides the Prime strip under every order
 * card (the same switch as on the in-transit Prime row). Hidden for tenants
 * without a switched-on Prime link.
 */
export function PrimeTrackToggle() {
    const { t } = useLanguage();
    const { connected } = usePrimeConnection();
    const on = useOrderStore((s) => s.primeTrackOnCards);
    const setOn = useOrderStore((s) => s.setPrimeTrackOnCards);
    if (!connected) return null;
    const label = on ? t("orders.prime.trackToggle.hide") : t("orders.prime.trackToggle.show");
    return (
        <button
            type="button"
            data-prime-track-toggle
            onClick={() => setOn(!on)}
            aria-pressed={on}
            className={cn(
                "p-2.5 rounded-xl transition-all duration-300",
                on
                    ? "bg-[#E8EEF8] text-[#1F3F75] shadow-sm dark:bg-[var(--primary)] dark:text-black"
                    : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5",
            )}
            title={label}
            aria-label={label}
        >
            <span aria-hidden="true" className="block h-4 w-6 bg-current [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
        </button>
    );
}
