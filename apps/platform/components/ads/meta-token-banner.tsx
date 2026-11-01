"use client";

import { useLanguage } from "@/hooks/use-language";
import { tokenWarning, type TokenHealthView } from "@/lib/meta-token-warning";

const MESSAGE_KEY = {
    invalid: "ads.tokenInvalid",
    missingAdsRead: "ads.tokenMissingAdsRead",
    expiring: "ads.tokenExpiring",
} as const;

/** Red when the saved Meta token is dead or lacks ads_read, amber when it expires within 7 days. */
export function MetaTokenBanner({ health }: { health: TokenHealthView | null | undefined }) {
    const { t } = useLanguage();
    const warning = tokenWarning(health, new Date());
    if (!warning) return null;

    const date = health?.expiresAt ? new Date(health.expiresAt).toLocaleDateString() : "";
    const tone = warning === "expiring" ? "border-amber-500/30 bg-amber-500/10 text-amber-700" : "border-red-500/30 bg-red-500/10 text-red-600";
    return (
        <p role="status" className={`rounded-xl border p-3 text-sm ${tone}`}>
            {t(MESSAGE_KEY[warning]).replace("{date}", date)}
        </p>
    );
}
