"use client";

import { usePrimeConnection } from "@/hooks/use-prime-link";
import { readSetting, useSettings } from "@/hooks/use-settings";
import type { LabelBrand } from "@/lib/shipping-labels";

/**
 * This shop's label marks: the Prime mark when its parcels go through the
 * Prime API, the glass tape and sealed-perfume warning when it switched them
 * on in print settings. A shop that sells neither prints a plain label.
 */
export function useLabelBrand(): LabelBrand {
    const prime = usePrimeConnection();
    const { settings } = useSettings();
    return {
        primeLogo: prime.connected,
        fragileWarning: readSetting(settings, "print_settings").fragile_warning === true,
    };
}
