"use client";

import { usePrimeConnection } from "@/hooks/use-prime-link";
import { readSetting, useSettings } from "@/hooks/use-settings";
import type { LabelBrand } from "@/lib/shipping-labels";

/**
 * This shop's label marks: the Prime mark when its parcels go through the
 * Prime API, the "handle with care" tape and the no-opening line when it
 * switched them on in print settings. Otherwise the label is plain.
 */
export function useLabelBrand(): LabelBrand {
    const prime = usePrimeConnection();
    const { settings } = useSettings();
    const print = readSetting(settings, "print_settings");
    return {
        primeLogo: prime.connected,
        fragileWarning: print.fragile_warning === true,
        noOpenWarning: print.no_open_warning === true,
    };
}
