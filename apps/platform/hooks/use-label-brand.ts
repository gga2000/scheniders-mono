"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { readSetting, useSettings, type SettingValue } from "@/hooks/use-settings";
import { useStoreSnapshot } from "@/hooks/use-settings-attention";
import { LABEL_NO_OPEN_TEXT, LABEL_TEXT_LIMITS } from "@/lib/dispatch-label";
import { loadLabelLogo } from "@/lib/label-logo";
import type { LabelBrand } from "@/lib/shipping-labels";

/**
 * What the label carries for these print settings: the Prime mark when the shop's
 * parcels go through the Prime API, its logo when it switched that on, the
 * "handle with care" tape, the "do not open" box in its words (or the default
 * words), and its note to customers. Saved text longer than Settings allows is cut.
 */
export function labelBrandFromSettings(
    print: SettingValue<"print_settings">,
    { primeLinked, shopLogo }: { primeLinked: boolean; shopLogo: string | null },
): LabelBrand {
    const text = (value: string | undefined, limit: number) => (value ?? "").trim().slice(0, limit);
    return {
        primeLogo: primeLinked,
        shopLogo: print.shop_logo === true ? shopLogo : null,
        fragileWarning: print.fragile_warning === true,
        noOpen:
            print.no_open_warning === true
                ? {
                      text: text(print.no_open_text, LABEL_TEXT_LIMITS.noOpenText) || LABEL_NO_OPEN_TEXT,
                      subtext: text(print.no_open_subtext, LABEL_TEXT_LIMITS.noOpenSubtext),
                  }
                : null,
        customerNote: text(print.customer_note, LABEL_TEXT_LIMITS.customerNote),
    };
}

/** The shop logo as a label-ready data URL; null while loading, when there is none, or when it could not be read. */
export function useLabelLogo(url: string | null) {
    return useQuery({
        queryKey: ["label-logo", url],
        enabled: Boolean(url),
        staleTime: Infinity,
        retry: 1,
        queryFn: () => loadLabelLogo(url as string),
    });
}

/** This shop's label marks, as its print settings say. */
export function useLabelBrand(): LabelBrand {
    const prime = usePrimeConnection();
    const { settings } = useSettings();
    const print = readSetting(settings, "print_settings");
    const wantsLogo = print.shop_logo === true;
    const store = useStoreSnapshot(wantsLogo);
    const logo = useLabelLogo(wantsLogo ? (store.data?.logoUrl ?? null) : null);
    return labelBrandFromSettings(print, { primeLinked: prime.connected, shopLogo: logo.data ?? null });
}
